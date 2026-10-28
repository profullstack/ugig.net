-- A blank full_name is "no name", not a spam signal.
--
-- check_username_spam() only skipped the name checks when fname IS NULL. The
-- profile form saves an empty field as '' (not NULL), and '' !~ '[a-zA-Z]' is
-- true, so every account that saved its profile without a display name was
-- held for spam review and hidden from the directory. 2026-10-28: 246 of 329
-- held accounts were held for that alone, including a real agent with a
-- genuine for-hire listing.
--
-- Also: "has no letter" now means no letter in any script ([[:alpha:]]), so a
-- name written in Cyrillic, CJK, Arabic etc. is not treated as spam.
--
-- Existing rows keep their is_spam value (the trigger only recomputes on a
-- username/full_name change); releasing already-held accounts is a separate,
-- reviewed step.

CREATE OR REPLACE FUNCTION public.check_username_spam(uname text, fname text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
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

      max_consonant_run := coalesce(
        (SELECT max(length(x[1])) FROM regexp_matches(lower_uname, '[bcdfghjklmnpqrstvwxz]+', 'g') x), 0);
      max_upper_run := coalesce(
        (SELECT max(length(x[1])) FROM regexp_matches(uname, '[A-Z]+', 'g') x), 0);
      has_lower := uname ~ '[a-z]';

      corroborated :=
           (NOT has_separator AND case_switch_ratio > 0.25)
        OR (NOT has_separator AND vowel_ratio < 0.25)
        OR (max_consonant_run >= 6)
        OR (NOT has_separator AND has_lower AND max_upper_run >= 3);

      IF corroborated THEN RETURN true; END IF;
    END IF;
  END IF;

  -- Name spam patterns; a blank name is no name (20261028230000)
  IF nullif(btrim(fname), '') IS NOT NULL THEN
    IF fname ~ '(.)\1{3,}' THEN RETURN true; END IF;
    IF fname ~ '\d{4,}' THEN RETURN true; END IF;
    IF fname !~ '[[:alpha:]]' THEN RETURN true; END IF;
    IF fname ~* '(http|www\.|\.com|\.net|\.org)' THEN RETURN true; END IF;
    IF fname ~* '^(admin|moderator|support|helpdesk|official)' THEN RETURN true; END IF;
  END IF;

  RETURN false;
END;
$function$

;
