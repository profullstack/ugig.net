-- The mixed-case rule has the same flaw the entropy rule had: it fires alone on a
-- name shape that legitimate users pick deliberately.
--
-- "14+ letters with a case-switch ratio above 0.3" is meant to catch generated
-- strings like "BlQyGebwabqMZMmdOp". But CamelCase flips case once per word, and with
-- short words that ratio is easily exceeded: "TheRealRiotCoder" scores 0.44 and was
-- suspended for being spelled the way its owner chose to spell it. Of the 153 names
-- the rule catches, 10 are ordinary CamelCase (AdaLovelaceBot, SophiaElyaLabs,
-- WatchingMyHuman, JeffGarroRojas).
--
-- The rule now requires that the name NOT read as deliberate CamelCase. Clean
-- CamelCase is a capital followed by a lowercase run, repeated -- ^([A-Z][a-z]+)+$.
-- Generated strings break that shape: they start lowercase ("eMoRPtApRJxcuiGD") or
-- contain consecutive capitals ("OisIHtXmpaUjTVzPmY" -> "IH"). A vowel-ratio floor
-- backs it up, so a random string that happens to fit the shape is still caught.

CREATE OR REPLACE FUNCTION check_username_spam(uname text, fname text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  lower_uname text;
  letters text;
  vowel_count int;
  entropy float;
  i int;
  counts int[256];
  p float;
  has_separator boolean;
  vowel_ratio float;
  case_switches int;
  case_switch_ratio float;
  max_consonant_run int;
  max_upper_run int;
  has_lower boolean;
  corroborated boolean;
BEGIN
  IF uname IS NULL THEN RETURN false; END IF;
  lower_uname := lower(uname);
  letters := lower(regexp_replace(uname, '[^a-zA-Z]', '', 'g'));
  vowel_ratio := CASE WHEN length(letters) = 0 THEN 1
                      ELSE length(regexp_replace(letters, '[^aeiou]', '', 'g'))::float / length(letters) END;

  -- Username spam patterns (unchanged)
  IF lower_uname ~ '^[a-z]{2,4}\d{5,}$' THEN RETURN true; END IF;
  IF lower_uname ~ '^user\d{4,}$' THEN RETURN true; END IF;
  IF lower_uname ~ '^[a-z]+_[a-z]+\d{3,}$' THEN RETURN true; END IF;
  IF uname ~ '\d{8,}' THEN RETURN true; END IF;
  IF lower_uname ~ '^[a-z0-9]{20,}$' THEN RETURN true; END IF;
  IF uname ~ '(.)\1{4,}' THEN RETURN true; END IF;
  IF lower_uname ~ '^(buy|sell|cheap|free|promo|discount|crypto|nft|airdrop|casino|poker|viagra|cialis)' THEN RETURN true; END IF;
  IF lower_uname ~ '(seo|marketing|agency|boost|traffic|followers|likes)\d*$' THEN RETURN true; END IF;

  -- Mixed-case random -- now skipped when the name reads as deliberate CamelCase.
  IF uname ~ '^[a-zA-Z]{14,}$'
     AND NOT (uname ~ '^([A-Z][a-z]+)+$' AND vowel_ratio >= 0.25) THEN
    DECLARE
      switches int := 0;
      prev_upper boolean;
      curr_upper boolean;
    BEGIN
      prev_upper := ascii(substr(uname, 1, 1)) BETWEEN 65 AND 90;
      FOR i IN 2..length(uname) LOOP
        curr_upper := ascii(substr(uname, i, 1)) BETWEEN 65 AND 90;
        IF curr_upper != prev_upper THEN switches := switches + 1; END IF;
        prev_upper := curr_upper;
      END LOOP;
      IF switches::float / length(uname) > 0.3 THEN RETURN true; END IF;
    END;
  END IF;

  -- Keyboard mash: long string with very few vowels (unchanged)
  IF length(letters) > 8 THEN
    vowel_count := length(regexp_replace(letters, '[^aeiou]', '', 'g'));
    IF vowel_count::float / length(letters) < 0.15 THEN RETURN true; END IF;
  END IF;

  -- Shannon entropy -- requires a corroborating randomness signal (20260816120000).
  IF length(uname) > 10 THEN
    counts := array_fill(0, ARRAY[256]);
    FOR i IN 1..length(uname) LOOP
      counts[ascii(substr(uname, i, 1)) + 1] := counts[ascii(substr(uname, i, 1)) + 1] + 1;
    END LOOP;
    entropy := 0;
    FOR i IN 1..256 LOOP
      IF counts[i] > 0 THEN
        p := counts[i]::float / length(uname);
        entropy := entropy - p * (ln(p) / ln(2));
      END IF;
    END LOOP;

    IF entropy > 3.8 THEN
      has_separator := uname ~ '[_.\-]';

      case_switches := 0;
      FOR i IN 2..length(uname) LOOP
        IF substr(uname, i, 1) ~ '[a-zA-Z]' AND substr(uname, i - 1, 1) ~ '[a-zA-Z]'
           AND (ascii(substr(uname, i, 1)) BETWEEN 65 AND 90)
               IS DISTINCT FROM (ascii(substr(uname, i - 1, 1)) BETWEEN 65 AND 90)
        THEN
          case_switches := case_switches + 1;
        END IF;
      END LOOP;
      case_switch_ratio := case_switches::float / length(uname);

      -- 'y' is excluded as a semivowel: counting it turns readable compounds into
      -- false clusters ("watchingmyhuman" -> "ngmyh"). 6 rather than 5 because real
      -- compounds reach 5 ("northstar" -> "rthst").
      max_consonant_run := coalesce(
        (SELECT max(length(x[1])) FROM regexp_matches(lower_uname, '[bcdfghjklmnpqrstvwxz]+', 'g') x), 0);
      max_upper_run := coalesce(
        (SELECT max(length(x[1])) FROM regexp_matches(uname, '[A-Z]+', 'g') x), 0);
      has_lower := uname ~ '[a-z]';

      corroborated :=
           (NOT has_separator AND case_switch_ratio > 0.25)   -- randomly cased token
        OR (NOT has_separator AND vowel_ratio < 0.25)          -- consonant-heavy token
        OR (max_consonant_run >= 6)                            -- unpronounceable cluster
        OR (NOT has_separator AND has_lower AND max_upper_run >= 3); -- capital run mid-token

      IF corroborated THEN RETURN true; END IF;
    END IF;
  END IF;

  -- Name spam patterns (unchanged)
  IF fname IS NOT NULL THEN
    IF fname ~ '(.)\1{3,}' THEN RETURN true; END IF;
    IF fname ~ '\d{4,}' THEN RETURN true; END IF;
    IF fname !~ '[a-zA-Z]' THEN RETURN true; END IF;
    IF fname ~* '(http|www\.|\.com|\.net|\.org)' THEN RETURN true; END IF;
    IF fname ~* '^(admin|moderator|support|helpdesk|official)' THEN RETURN true; END IF;
  END IF;

  RETURN false;
END;
$$;

-- Re-backfill so CamelCase names flagged by the mixed-case rule alone are released.
UPDATE profiles SET is_spam = check_username_spam(username, full_name)
WHERE is_spam IS DISTINCT FROM check_username_spam(username, full_name);
