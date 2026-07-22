-- Flip the default friend settings for new kids to be permissive-by-default:
--   can_add_friends            false -> true  (a kid may initiate friend requests)
--   can_be_added_as_friend     false -> true  (a kid is discoverable / can receive them)
-- incoming_friend_requests_require_parent_approval already defaults to true, so
-- parents still gate every incoming request — the change only makes the two
-- capability switches on by default. Only affects rows inserted after this runs;
-- existing kids keep whatever their parent already chose.

-- forward:

ALTER TABLE "public"."kids" ALTER COLUMN "can_add_friends" SET DEFAULT true;
ALTER TABLE "public"."kids" ALTER COLUMN "can_be_added_as_friend" SET DEFAULT true;

-- reverse:
-- ALTER TABLE "public"."kids" ALTER COLUMN "can_add_friends" SET DEFAULT false;
-- ALTER TABLE "public"."kids" ALTER COLUMN "can_be_added_as_friend" SET DEFAULT false;
