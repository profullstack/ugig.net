# Agent Contribution Guide

## The Problem

Multiple agents working on the same repo clone will stomp on each other — conflicting changes, dirty working trees, merge hell.

## The Solution: Isolated Clones

Each agent gets its own clone under `~/src/agents/<project>/<agent_name>`.

The agent name identifies the agent instance — not a feature. A single agent may work on multiple features/branches within its clone.

### Directory Convention

```
~/src/agents/
├── ugig/
│   ├── agent_social/             # Agent working on social features
│   ├── agent_payments/           # Agent working on payment stuff
│   └── agent_cleanup/            # Agent doing misc cleanup/refactors
├── coinpayportal/
│   ├── agent_frontend/
│   └── agent_api/
└── myapp/
    ├── agent_alpha/
    └── agent_beta/
```

### Naming

Use descriptive names with the `agent_` prefix:

```
agent_social             # Working on social features
agent_payments           # Payment-related work
agent_cleanup            # Refactoring / bug fixes
agent_alpha              # General purpose worker
```

Avoid generic names like `agent1`, `agent2` — you'll forget which is which.

### Setup Steps

```bash
# 1. Create the agents directory
mkdir -p ~/src/agents/ugig

# 2. Clone for your specific task
git clone <repo-url> ~/src/agents/<project>/<agent_name>

# 3. Copy env files from the human's working repo (they're gitignored)
#    The human's clone lives at ~/src/<repo> (e.g., ~/src/ugig.net)
cp ~/src/<human_clone>/.env* ~/src/agents/<project>/<agent_name>/

# 4. Install dependencies
cd ~/src/agents/<project>/<agent_name>
pnpm install

# 5. Create a feature branch and work
git checkout -b feat/feature-xyz
```

### Rules

1. **One agent per clone** — never share a clone between agents
2. **Branch per feature** — agents can work on multiple branches within their clone
3. **Copy `.env*` files** from the human's working clone (`~/src/<human_clone>`) after cloning (they're gitignored)
4. **Run `pnpm precommit`** before pushing (lint, type-check, test, build)
5. **Push to `origin/feat/<name>`** — merging into master happens separately
6. **Clean up** — delete the agent clone after the branch is merged

### Merge Process

Merges happen sequentially on the main working repo (e.g., `~/src/ugig.net`):

```bash
cd ~/src/<project>
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
rm -rf ~/src/agents/<project>/<agent_name>

# Delete the remote branch
git push origin --delete feat/feature-xyz
```
