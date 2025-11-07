# Next Steps: Complete Project Rename to mcp2rest

All code and documentation has been updated from `mcp-gateway` to `mcp2rest`. Here's what's left to do:

## 1. Rename the Root Directory

The project directory needs to be renamed manually. You can't do this from within the directory.

**Option A: Using Finder**
1. Navigate to `/Users/ulasbilgen/GithubProjects/`
2. Right-click on `mcp-gateway` folder
3. Select "Rename"
4. Change name to `mcp2rest`

**Option B: Using Terminal**
```bash
# Open a NEW terminal (not this one)
cd /Users/ulasbilgen/GithubProjects
mv mcp-gateway mcp2rest
cd mcp2rest
```

## 2. Create Clean Git History

After renaming the directory, run these commands to create a fresh git history without the .kiro files from previous commits:

```bash
# Navigate to the renamed directory
cd /Users/ulasbilgen/GithubProjects/mcp2rest

# Create a new orphan branch (no history)
git checkout --orphan fresh-main

# Stage all current files
git add -A

# Create initial commit
git commit -m "Initial commit: mcp2rest - MCP to REST API gateway

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# Delete old main branch
git branch -D main

# Rename fresh-main to main
git branch -m main
```

## 3. Create GitHub Repository

1. Go to https://github.com/new
2. Repository name: `mcp2rest`
3. Description: "A standalone Node.js daemon that manages multiple MCP servers and exposes their tools via REST API"
4. Public or Private: Your choice
5. **DO NOT** initialize with README, .gitignore, or license (we already have these)
6. Click "Create repository"

## 4. Push to GitHub

After creating the repository on GitHub:

```bash
# Add the remote repository
git remote add origin https://github.com/ulasbilgen/mcp2rest.git

# Push to remote
git push -u origin main
```

## 5. Verify Everything Works

```bash
# Test the build
npm run build

# Check that the CLI command works
npm start
```

## Summary of Changes Made

- ✅ All source files updated (`.ts` files)
- ✅ Configuration files updated (`package.json`, `ecosystem.config.js`, `tsconfig.json`)
- ✅ Documentation updated (`README.md`, `CLAUDE.md`, `MCP_Gateway_PRD.md`)
- ✅ Binary command renamed: `mcp-gateway` → `mcp2rest`
- ✅ Config directory path: `~/.mcp-gateway` → `~/.mcp2rest`
- ✅ GitHub URLs updated to use `ulasbilgen/mcp2rest`
- ✅ Project rebuilt and dependencies updated
- ✅ `.kiro/specs/` directory and files updated

## Notes

- The npm package name is now `mcp2rest` (verified available on npm)
- All CLI commands now use `mcp2rest` instead of `mcp-gateway`
- The config directory has changed, so existing configurations won't be migrated automatically (but there are no existing users yet)
- The `.kiro/`, `.vscode/`, `.claude/`, and `CLAUDE.md` files are in `.gitignore` and won't be pushed to GitHub

Once you complete steps 1-4 above, the project will be fully renamed and published to GitHub!
