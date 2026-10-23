package common

import (
	"fmt"
	"os"
	"strings"
)

type DatabaseType string

const (
	DatabaseTypeMySQL      DatabaseType = "mysql"
	DatabaseTypeSQLite     DatabaseType = "sqlite"
	DatabaseTypePostgreSQL DatabaseType = "postgres"
	DatabaseTypeClickHouse DatabaseType = "clickhouse"
)

var mainDatabaseType = DatabaseTypeSQLite
var logDatabaseType = DatabaseTypeSQLite

func MainDatabaseType() DatabaseType {
	return mainDatabaseType
}

func LogDatabaseType() DatabaseType {
	return logDatabaseType
}

func SetMainDatabaseType(databaseType DatabaseType) {
	mainDatabaseType = databaseType
}

func SetLogDatabaseType(databaseType DatabaseType) {
	logDatabaseType = databaseType
}

func SetDatabaseTypes(mainType DatabaseType, logType DatabaseType) {
	mainDatabaseType = mainType
	logDatabaseType = logType
}

func UsingMainDatabase(databaseType DatabaseType) bool {
	return mainDatabaseType == databaseType
}

func UsingLogDatabase(databaseType DatabaseType) bool {
	return logDatabaseType == databaseType
}

const sqliteConnectionOptions = "?_pragma=busy_timeout(30000)&_pragma=journal_mode(WAL)&_txlock=immediate"

// SQLitePath is the DSN for the default SQLite database. It uses WAL journal
// mode so readers are never blocked by the single writer, plus a 30s busy
// timeout for writers to queue.
//
// Two details are non-obvious and both are required for concurrent correctness:
//
//  1. The busy timeout must be passed as a `_pragma=busy_timeout(30000)` DSN
//     parameter. The pure-Go driver (modernc.org/sqlite, used through
//     github.com/glebarez/sqlite) silently ignores the plain `_busy_timeout=`
//     form, so without this the effective timeout stays at SQLite's 5s default
//     and concurrent writes surface as "database is locked" (see #6805).
//
//  2. `_txlock=immediate` (BEGIN IMMEDIATE) must be enabled. Without it, a
//     transaction that first SELECTs (establishing a read snapshot) and then
//     writes can hit SQLITE_BUSY_SNAPSHOT when another connection commits in
//     between; the busy handler does not cover that case, so the write fails
//     instantly no matter the timeout. BEGIN IMMEDIATE takes the write lock up
//     front, so writers serialize through the busy timeout instead of dying on
//     a stale snapshot. Autocommit SELECTs stay concurrent because WAL keeps
//     readers unlocked.
var SQLitePath = "ai-gateway.db" + sqliteConnectionOptions

func initSQLitePath() error {
	if configured := os.Getenv("SQLITE_PATH"); configured != "" {
		SQLitePath = configured
		return nil
	}
	mainDSN, logDSN := os.Getenv("SQL_DSN"), os.Getenv("LOG_SQL_DSN")
	if mainDSN != "" && !strings.HasPrefix(mainDSN, "local") && !strings.HasPrefix(logDSN, "local") {
		return nil
	}

	var existing string
	// Reuse legacy files in place: renaming an open SQLite database, or moving
	// its WAL/SHM separately, can corrupt it. Operators can rename it offline.
	for _, name := range []string{"ai-gateway.db", "one-api.db", "new-api.db"} {
		var hasDatabase, hasSidecar bool
		for _, suffix := range []string{"", "-wal", "-shm", "-journal"} {
			filename := name + suffix
			info, err := os.Lstat(filename)
			if os.IsNotExist(err) {
				continue
			}
			if err != nil {
				return fmt.Errorf("inspect SQLite file %s: %w", filename, err)
			}
			if !info.Mode().IsRegular() {
				return fmt.Errorf("SQLite file %s is not a regular file; set SQLITE_PATH explicitly", filename)
			}
			if suffix == "" {
				hasDatabase = true
			} else {
				hasSidecar = true
			}
		}
		if !hasDatabase && hasSidecar {
			return fmt.Errorf("SQLite sidecars exist without %s; recover the database or set SQLITE_PATH explicitly", name)
		}
		if !hasDatabase {
			continue
		}
		if existing != "" {
			return fmt.Errorf("multiple SQLite databases found (%s, %s); set SQLITE_PATH explicitly", existing, name)
		}
		existing = name
	}
	if existing == "" {
		existing = "ai-gateway.db"
	}
	SQLitePath = existing + sqliteConnectionOptions
	return nil
}
