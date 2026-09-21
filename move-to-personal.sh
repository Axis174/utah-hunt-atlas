#!/usr/bin/env bash
# Move Ranger Hawk (repo: utah-hunt-atlas) from the Axis174 business account to a personal one.
#
#   ./move-to-personal.sh <personal-github-username>
#
# Creates the repo under the personal account, pushes the clean history,
# turns on Pages, waits for the first deploy, verifies the live URLs, and
# leaves the Axis174 copies for you to delete once you are happy.
set -euo pipefail

NEW="${1:-}"
[ -z "$NEW" ] && { echo "usage: $0 <personal-github-username>"; exit 1; }
OLD_OWNER="Axis174"
REPO="utah-hunt-atlas"
cd "$(dirname "$0")"

echo "==> Checking you are signed in as $NEW"
ACTIVE=$(gh api user --jq .login)
if [ "$ACTIVE" != "$NEW" ]; then
  echo "    Active gh account is '$ACTIVE', not '$NEW'."
  echo "    Run:  gh auth login            # sign in to the personal account"
  echo "    Then: gh auth switch --user $NEW"
  exit 1
fi

echo "==> Creating $NEW/$REPO (public, for Pages)"
gh repo create "$NEW/$REPO" --public \
  --description "Personal Utah hunting reference: offline phone app, calendar reminders, and a daily data refresh for birds and big game." \
  2>/dev/null || echo "    already exists, continuing"

echo "==> Pushing"
git remote remove personal 2>/dev/null || true
git remote add personal "https://github.com/$NEW/$REPO.git"
git push -u personal main --force

echo "==> Enabling GitHub Pages"
gh api -X POST "repos/$NEW/$REPO/pages" -f build_type=workflow >/dev/null 2>&1 \
  || echo "    already enabled"

echo "==> Running the refresh workflow"
gh workflow run refresh.yml --repo "$NEW/$REPO"
sleep 12
ID=$(gh run list --repo "$NEW/$REPO" --workflow refresh.yml --limit 1 --json databaseId --jq '.[0].databaseId')
echo "    run $ID"
until [ "$(gh run view "$ID" --repo "$NEW/$REPO" --json status --jq .status)" = "completed" ]; do
  sleep 20
done
CONC=$(gh run view "$ID" --repo "$NEW/$REPO" --json conclusion --jq .conclusion)
echo "    result: $CONC"
[ "$CONC" = "success" ] || { echo "    deploy failed - see: gh run view $ID --repo $NEW/$REPO --log-failed"; exit 1; }

BASE="https://${NEW,,}.github.io/$REPO"
echo "==> Verifying $BASE"
for P in "/" "/hunt.ics" "/data/bird_access.json" "/data/seasons.json"; do
  printf "    %-26s %s\n" "$P" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 40 "$BASE$P")"
done

git remote set-url origin "https://github.com/$NEW/$REPO.git"
git remote remove personal

cat <<DONE

------------------------------------------------------------------
Moved.

  App       $BASE/
  Calendar  $BASE/hunt.ics

On your phone:
  1. Delete the old home-screen icon and any old calendar subscription
     (they point at the axis174 URL, which will stop updating).
  2. Open $BASE/ in Safari, Share > Add to Home Screen.
  3. In the app: Reminders > Subscribe in Calendar.

Then clean up the business account:
  gh auth switch --user $OLD_OWNER
  gh auth refresh -h github.com -s delete_repo
  gh repo delete $OLD_OWNER/$REPO --yes
  gh repo delete $OLD_OWNER/$REPO-old-private --yes
  gh auth switch --user $NEW
------------------------------------------------------------------
DONE
