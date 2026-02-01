-- Fix: Vote persistence bug
-- The RLS policy on posts only allows the author to update their own post.
-- When another user votes, the post_votes row is saved but the count update
-- on posts is silently rejected by RLS. Fix: use a SECURITY DEFINER trigger
-- on post_votes that recalculates counts, bypassing RLS.

-- Function to recalculate post vote counts from post_votes
CREATE OR REPLACE FUNCTION recalculate_post_votes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_post_id UUID;
  new_upvotes INT;
  new_downvotes INT;
BEGIN
  -- Determine which post was affected
  IF TG_OP = 'DELETE' THEN
    target_post_id := OLD.post_id;
  ELSE
    target_post_id := NEW.post_id;
  END IF;

  -- Count votes from the source of truth (post_votes table)
  SELECT
    COALESCE(SUM(CASE WHEN vote_type = 1 THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN vote_type = -1 THEN 1 ELSE 0 END), 0)
  INTO new_upvotes, new_downvotes
  FROM post_votes
  WHERE post_id = target_post_id;

  -- Update the posts table (SECURITY DEFINER bypasses RLS)
  UPDATE posts
  SET
    upvotes = new_upvotes,
    downvotes = new_downvotes,
    score = new_upvotes - new_downvotes
  WHERE id = target_post_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger on post_votes for INSERT, UPDATE, DELETE
CREATE TRIGGER trg_recalculate_post_votes
  AFTER INSERT OR UPDATE OR DELETE ON post_votes
  FOR EACH ROW EXECUTE FUNCTION recalculate_post_votes();
