# Agent Contribution Guide

## The Problem

Multiple agents working on the same repo clone will stomp on each other — conflicting changes, dirty working trees, merge hell.

## The Solution: Isolated Clones

Each agent gets its own clone under `~/src/agents/<project>/agent_<purpose>`.

### Directory Convention

```
~/src/agents/
└── ugig/
    ├── agent_activity_feed/      # Clone for activity feed work
    ├── agent_gig_comments/       # Clone for gig comments
    ├── agent_follow_system/      # Clone for follow system
    └── agent_endorsements/       # Clone for endorsements
```

### Naming

Use descriptive purpose names: `agent_<feature_or_task>`

```
agent_feature_xyz        # Feature work
agent_bugfix_stripe      # Bug fix
agent_refactor_auth      # Refactor
agent_migration_v2       # Migration work
```

Avoid generic names like `agent1`, `agent2` — you'll forget which is which.

### Setup Steps

```bash
# 1. Create the agents directory
mkdir -p ~/src/agents/ugig

# 2. Clone for your specific task
git clone git@github.com:profullstack/ugig.net.git ~/src/agents/ugig/agent_feature_xyz

# 3. Copy env files from the working repo
cp ~/src/ugig.net/.env* ~/src/agents/ugig/agent_feature_xyz/

# 4. Install dependencies
cd ~/src/agents/ugig/agent_feature_xyz
pnpm install

# 5. Create a feature branch and work
git checkout -b feat/feature-xyz
```

### Rules

1. **One agent per clone** — never share a clone between agents
2. **One feature branch per agent** — keep it focused
3. **Copy `.env*` files** from `~/src/ugig.net/` after cloning (they're gitignored)
4. **Run `pnpm precommit`** before pushing (lint, type-check, test, build)
5. **Push to `origin/feat/<name>`** — merging into master happens separately
6. **Clean up** — delete the agent clone after the branch is merged

### Merge Process

Merges happen sequentially on the main working repo (`~/src/ugig.net`):

```bash
cd ~/src/ugig.net
git checkout master
git pull

# Merge one branch at a time
git merge origin/feat/feature-a
pnpm precommit          # Must pass before continuing
git push

git merge origin/feat/feature-b
pnpm precommit          # Must pass before continuing
git push

# ... repeat for each branch
```

If `pnpm precommit` fails after a merge, fix it before moving to the next branch.

### Cleanup

After a branch is merged:

```bash
# Delete the agent clone
rm -rf ~/src/agents/ugig/agent_feature_xyz

# Delete the remote branch
git push origin --delete feat/feature-xyz
```
