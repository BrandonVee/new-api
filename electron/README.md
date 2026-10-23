# Ai-gateway Electron Desktop App

This directory contains the Electron wrapper for Ai-gateway, providing a native desktop application with system tray support for Windows, macOS, and Linux.

## Prerequisites

### 1. Go Binary (Required)
The Electron app requires the compiled Go binary to function. You have two options:

**Option A: Use existing binary (without Go installed)**
```bash
# If you have a pre-built binary (e.g., ai-gateway-macos)
cp ../ai-gateway-macos ../ai-gateway
```

**Option B: Build from source (requires Go)**
TODO

### 2. Electron Dependencies
```bash
cd electron
npm install
```

## Development

Start the backend, the frontend, and Electron in separate terminals:
```bash
# Repository root
go run main.go

# Repository root
make dev-web

# electron/
npm run dev-app
```

This will:
- Use the Go backend on port 3000
- Use the Rsbuild frontend development server on port 5173
- Open an Electron window with DevTools enabled
- Create a system tray icon (menu bar on macOS)
- Use the manually started backend's database (`./ai-gateway.db` in the repository root by default, or its explicit `SQLITE_PATH` / `SQL_DSN`)

## Building for Production

### Quick Build
```bash
# From electron/, build the frontend, Go binary, and desktop package
./build.sh

# Or package an existing binary for the current platform
npm run build

# Platform-specific builds
npm run build:mac    # Creates .dmg and .zip
npm run build:win    # Creates .exe installer
npm run build:linux  # Creates .AppImage and .deb
```

### Build Output
- Built applications are in `electron/dist/`
- macOS: `.dmg` (installer) and `.zip` (portable)
- Windows: `.exe` (installer) and portable exe
- Linux: `.AppImage` and `.deb`

## Configuration

### Port
Default port is 3000. To change, edit `main.js`:
```javascript
const PORT = 3000; // Change to desired port
```

### Database Location
- **Development**: the manually started backend's working directory, `./ai-gateway.db` by default
- **Production**:
  - macOS: `~/Library/Application Support/Ai-gateway/data/`
  - Windows: `%APPDATA%/Ai-gateway/data/`
  - Linux: `~/.config/Ai-gateway/data/`

New installations create `ai-gateway.db`. Explicit `SQLITE_PATH`, `SQL_DSN`, and
`LOG_SQL_DSN` values are passed to the backend unchanged. The desktop app also searches earlier
installation directories for existing databases and reuses a single existing
file in place, including its WAL/SHM and rollback journal. It never renames or
copies a potentially active database. Multiple candidates, non-regular files,
and sidecars without a database stop automatic selection; set `SQLITE_PATH` to
the intended database after checking and backing up the files.

To rename an existing SQLite database, stop **every** process using it, back up
the complete directory, then checkpoint it with SQLite (`PRAGMA wal_checkpoint(TRUNCATE);`)
and confirm that checkpoint succeeds with no busy readers or writers. Close the
SQLite connection cleanly before renaming the database to `ai-gateway.db`.
If a WAL, SHM, or rollback journal remains, recover/checkpoint it first; never
delete it or move only the main file. Do not overwrite an existing destination.
Keep the backup until the app's accounts and records have been verified. The
backend's automatic discovery follows the same policy in its working directory.
