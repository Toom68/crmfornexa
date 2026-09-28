-- Switch from better-auth tables to Supabase Auth.
-- auth.users holds credentials/sessions; "User" is the app profile linked by authUserId.

DROP TABLE "Session";
DROP TABLE "Account";
DROP TABLE "Verification";

ALTER TABLE "User" DROP COLUMN "emailVerified";
ALTER TABLE "User" DROP COLUMN "image";
ALTER TABLE "User" ADD COLUMN "authUserId" TEXT;

CREATE UNIQUE INDEX "User_authUserId_key" ON "User"("authUserId");
