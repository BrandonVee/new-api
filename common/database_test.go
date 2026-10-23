package common

import (
	"database/sql"
	"os"
	"testing"

	_ "github.com/glebarez/go-sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSQLitePathDiscovery(t *testing.T) {
	for _, tc := range []struct {
		name  string
		files []string
		want  string
		fail  bool
	}{
		{name: "fresh installation", want: "ai-gateway.db"},
		{name: "new database", files: []string{"ai-gateway.db"}, want: "ai-gateway.db"},
		{name: "legacy server database", files: []string{"one-api.db"}, want: "one-api.db"},
		{name: "legacy desktop database", files: []string{"new-api.db", "new-api.db-wal", "new-api.db-shm"}, want: "new-api.db"},
		{name: "two databases", files: []string{"ai-gateway.db", "one-api.db"}, fail: true},
		{name: "two legacy databases", files: []string{"new-api.db", "one-api.db"}, fail: true},
		{name: "orphan WAL", files: []string{"one-api.db-wal"}, fail: true},
		{name: "orphan SHM beside new database", files: []string{"ai-gateway.db", "new-api.db-shm"}, fail: true},
		{name: "orphan rollback journal", files: []string{"one-api.db-journal"}, fail: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Chdir(t.TempDir())
			t.Setenv("SQLITE_PATH", "")
			t.Setenv("SQL_DSN", "")
			t.Setenv("LOG_SQL_DSN", "")
			previous := SQLitePath
			t.Cleanup(func() { SQLitePath = previous })
			for _, name := range tc.files {
				require.NoError(t, os.WriteFile(name, []byte("preserve "+name), 0600))
			}
			err := initSQLitePath()
			if tc.fail {
				require.Error(t, err)
				assert.Equal(t, previous, SQLitePath)
			} else {
				require.NoError(t, err)
				assert.Equal(t, tc.want+sqliteConnectionOptions, SQLitePath)
			}
			for _, name := range tc.files {
				content, err := os.ReadFile(name)
				require.NoError(t, err)
				assert.Equal(t, "preserve "+name, string(content))
			}
			files, err := os.ReadDir(".")
			require.NoError(t, err)
			assert.Len(t, files, len(tc.files), "discovery must not create or move files")
		})
	}
}

func TestSQLitePathExplicitConfiguration(t *testing.T) {
	for _, tc := range []struct {
		name, path, mainDSN, logDSN string
		fail                        bool
	}{
		{name: "explicit SQLite path", path: "file:custom.db?mode=rwc&_pragma=busy_timeout(123)"},
		{name: "explicit MySQL", mainDSN: "gateway@tcp(localhost:3306)/ai-gateway"},
		{name: "explicit PostgreSQL", mainDSN: "postgres://localhost/ai-gateway"},
		{name: "explicit main and log", mainDSN: "postgres://localhost/ai-gateway", logDSN: "postgres://localhost/ai-gateway-log"},
		{name: "local main requires discovery", mainDSN: "local", fail: true},
		{name: "local log requires discovery", mainDSN: "postgres://localhost/ai-gateway", logDSN: "local", fail: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Chdir(t.TempDir())
			t.Setenv("SQLITE_PATH", tc.path)
			t.Setenv("SQL_DSN", tc.mainDSN)
			t.Setenv("LOG_SQL_DSN", tc.logDSN)
			previous := SQLitePath
			t.Cleanup(func() { SQLitePath = previous })
			require.NoError(t, os.WriteFile("one-api.db-shm", []byte("keep"), 0600))
			err := initSQLitePath()
			if tc.fail {
				require.Error(t, err)
			} else {
				require.NoError(t, err)
			}
			want := previous
			if tc.path != "" {
				want = tc.path
			}
			assert.Equal(t, want, SQLitePath)
			assert.Equal(t, tc.mainDSN, os.Getenv("SQL_DSN"))
			assert.Equal(t, tc.logDSN, os.Getenv("LOG_SQL_DSN"))
			content, err := os.ReadFile("one-api.db-shm")
			require.NoError(t, err)
			assert.Equal(t, "keep", string(content))
		})
	}
}

func TestSQLitePathRejectsNonRegularFiles(t *testing.T) {
	for _, filename := range []string{"one-api.db", "ai-gateway.db-wal"} {
		t.Run(filename, func(t *testing.T) {
			t.Chdir(t.TempDir())
			t.Setenv("SQLITE_PATH", "")
			t.Setenv("SQL_DSN", "")
			t.Setenv("LOG_SQL_DSN", "")
			require.NoError(t, os.Mkdir(filename, 0700))
			require.ErrorContains(t, initSQLitePath(), "not a regular file")
		})
	}
	t.Run("symlink", func(t *testing.T) {
		t.Chdir(t.TempDir())
		t.Setenv("SQLITE_PATH", "")
		t.Setenv("SQL_DSN", "")
		t.Setenv("LOG_SQL_DSN", "")
		require.NoError(t, os.WriteFile("external.db", []byte("keep"), 0600))
		if err := os.Symlink("external.db", "one-api.db"); err != nil {
			t.Skipf("symlinks unavailable: %v", err)
		}
		require.ErrorContains(t, initSQLitePath(), "not a regular file")
		content, err := os.ReadFile("external.db")
		require.NoError(t, err)
		assert.Equal(t, "keep", string(content))
	})
}

func TestSQLitePathPreservesLiveWAL(t *testing.T) {
	for _, legacy := range []string{"one-api.db", "new-api.db"} {
		t.Run(legacy, func(t *testing.T) {
			t.Chdir(t.TempDir())
			t.Setenv("SQLITE_PATH", "")
			t.Setenv("SQL_DSN", "")
			t.Setenv("LOG_SQL_DSN", "")
			previous := SQLitePath
			t.Cleanup(func() { SQLitePath = previous })
			writer, err := sql.Open("sqlite", legacy+"?_pragma=journal_mode(WAL)&_pragma=wal_autocheckpoint(0)")
			require.NoError(t, err)
			defer writer.Close()
			writer.SetMaxOpenConns(1)
			_, err = writer.Exec("CREATE TABLE records (id INTEGER PRIMARY KEY, value TEXT NOT NULL)")
			require.NoError(t, err)
			_, err = writer.Exec("INSERT INTO records (id, value) VALUES (1, 'before discovery')")
			require.NoError(t, err)
			for _, suffix := range []string{"-wal", "-shm"} {
				info, err := os.Stat(legacy + suffix)
				require.NoError(t, err)
				assert.Positive(t, info.Size())
			}
			require.NoError(t, initSQLitePath())
			reader, err := sql.Open("sqlite", SQLitePath)
			require.NoError(t, err)
			defer reader.Close()
			var value string
			require.NoError(t, reader.QueryRow("SELECT value FROM records WHERE id = 1").Scan(&value))
			assert.Equal(t, "before discovery", value)
			_, err = writer.Exec("INSERT INTO records (id, value) VALUES (2, 'after discovery')")
			require.NoError(t, err)
			require.NoError(t, reader.QueryRow("SELECT value FROM records WHERE id = 2").Scan(&value))
			assert.Equal(t, "after discovery", value)
			_, err = os.Stat("ai-gateway.db")
			assert.True(t, os.IsNotExist(err), "must not fork a live legacy database")
			require.NoError(t, reader.Close())
			require.NoError(t, writer.Close())
			require.NoError(t, initSQLitePath(), "discovery must be idempotent after clean shutdown")
			assert.Equal(t, legacy+sqliteConnectionOptions, SQLitePath)
		})
	}
}

func TestSQLitePathCreatesNewDatabase(t *testing.T) {
	t.Chdir(t.TempDir())
	t.Setenv("SQLITE_PATH", "")
	t.Setenv("SQL_DSN", "")
	t.Setenv("LOG_SQL_DSN", "")
	previous := SQLitePath
	t.Cleanup(func() { SQLitePath = previous })
	require.NoError(t, initSQLitePath())
	db, err := sql.Open("sqlite", SQLitePath)
	require.NoError(t, err)
	defer db.Close()
	var version, mode string
	var timeout int
	require.NoError(t, db.QueryRow("SELECT sqlite_version()").Scan(&version))
	t.Logf("SQLite %s", version)
	require.NoError(t, db.QueryRow("PRAGMA journal_mode").Scan(&mode))
	assert.Equal(t, "wal", mode)
	require.NoError(t, db.QueryRow("PRAGMA busy_timeout").Scan(&timeout))
	assert.Equal(t, 30000, timeout)
	_, err = db.Exec("CREATE TABLE records (id INTEGER PRIMARY KEY, value TEXT NOT NULL)")
	require.NoError(t, err)
	_, err = db.Exec("INSERT INTO records (id, value) VALUES (1, 'preserved')")
	require.NoError(t, err)
	require.FileExists(t, "ai-gateway.db")
	require.NoError(t, db.Close())
	require.NoError(t, initSQLitePath())
	db, err = sql.Open("sqlite", SQLitePath)
	require.NoError(t, err)
	defer db.Close()
	var value string
	require.NoError(t, db.QueryRow("SELECT value FROM records WHERE id = 1").Scan(&value))
	assert.Equal(t, "preserved", value)
}
