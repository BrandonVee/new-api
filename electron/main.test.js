const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');

function desktopFixture(t, environment = {}) {
  const directory = fs.mkdtempSync(path.join(process.cwd(), '.electron-storage-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const appData = path.join(directory, 'appData');
  const currentData = path.join(appData, 'Ai-gateway', 'data');
  const calls = [];
  const env = { ...environment };
  const sandbox = {
    __dirname,
    process: { env, platform: process.platform, resourcesPath: directory },
    console: { log() {}, error() {} },
    setTimeout,
    require(name) {
      if (name === 'electron') {
        return {
          app: {
            getPath: (name) => name === 'appData' ? appData : path.join(appData, 'Ai-gateway'),
            whenReady: () => ({ then() {} }),
            on() {},
          },
        };
      }
      if (name === 'child_process') {
        return {
          spawn(binary, args, options) {
            calls.push({ binary, args, options });
            const child = new EventEmitter();
            child.stdout = new EventEmitter();
            child.stderr = new EventEmitter();
            return child;
          },
        };
      }
      return require(name);
    },
  };
  const startServer = vm.runInNewContext(
    `${source}\ncheckServerAvailability = () => Promise.resolve(); startServer;`,
    sandbox,
    { filename: 'main.js' },
  );
  return { appData, currentData, calls, env, startServer };
}

function putFile(filename, content = 'preserve') {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, content);
}

test('new installation uses the new SQLite name', async (t) => {
  const fixture = desktopFixture(t);
  await fixture.startServer();
  assert.equal(fixture.calls.length, 1);
  assert.equal(fixture.calls[0].options.env.SQLITE_PATH, path.join(fixture.currentData, 'ai-gateway.db'));
  assert.equal(fixture.env.ELECTRON_DATA_DIR, fixture.currentData);
});

test('legacy directories reuse databases and sidecars without moving them', async (t) => {
  for (const directory of ['Ai-gateway', 'New-API-App', 'New API', 'new-api-electron']) {
    for (const filename of ['ai-gateway.db', 'new-api.db', 'one-api.db']) {
      await t.test(`${directory}/${filename}`, async (t) => {
        const fixture = desktopFixture(t);
        const database = path.join(fixture.appData, directory, 'data', filename);
        for (const suffix of ['', '-wal', '-shm', '-journal']) putFile(database + suffix, `preserve${suffix}`);
        await fixture.startServer();
        assert.equal(fixture.calls[0].options.env.SQLITE_PATH, database);
        assert.equal(fixture.env.ELECTRON_DATA_DIR, path.dirname(database));
        for (const suffix of ['', '-wal', '-shm', '-journal']) {
          assert.equal(fs.readFileSync(database + suffix, 'utf8'), `preserve${suffix}`);
        }
        await fixture.startServer();
        assert.equal(fixture.calls[1].options.env.SQLITE_PATH, database);
      });
    }
  }
});

test('explicit database configuration passes through unchanged', async (t) => {
  for (const environment of [
    { SQLITE_PATH: 'file:custom.db?mode=rwc' },
    { SQL_DSN: 'postgres://localhost/ai-gateway' },
    { SQL_DSN: 'user@tcp(localhost:3306)/ai-gateway' },
    { SQL_DSN: 'postgres://localhost/ai-gateway', LOG_SQL_DSN: 'postgres://localhost/ai-gateway-log' },
    { SQLITE_PATH: 'custom.db', SQL_DSN: 'local' },
  ]) {
    await t.test(JSON.stringify(environment), async (t) => {
      const fixture = desktopFixture(t, environment);
      putFile(path.join(fixture.currentData, 'new-api.db-shm'));
      await fixture.startServer();
      for (const [name, value] of Object.entries(environment)) {
        assert.equal(fixture.calls[0].options.env[name], value);
      }
      if (!environment.SQLITE_PATH) assert.equal(fixture.calls[0].options.env.SQLITE_PATH, undefined);
    });
  }
});

test('local main or log DSN discovers existing databases', async (t) => {
  for (const environment of [
    { SQL_DSN: 'local' },
    { SQL_DSN: 'postgres://localhost/ai-gateway', LOG_SQL_DSN: 'local' },
  ]) {
    await t.test(JSON.stringify(environment), async (t) => {
      const fixture = desktopFixture(t, environment);
      const database = path.join(fixture.currentData, 'new-api.db');
      putFile(database);
      await fixture.startServer();
      for (const [name, value] of Object.entries(environment)) {
        assert.equal(fixture.calls[0].options.env[name], value);
      }
      assert.equal(fixture.calls[0].options.env.SQLITE_PATH, database);
    });
  }
});

test('ambiguous databases and orphan sidecars stop before spawning', async (t) => {
  for (const files of [
    ['Ai-gateway/data/ai-gateway.db', 'Ai-gateway/data/new-api.db'],
    ['Ai-gateway/data/ai-gateway.db', 'New API/data/new-api.db'],
    ['New API/data/new-api.db', 'new-api-electron/data/new-api.db'],
    ['Ai-gateway/data/ai-gateway.db-wal'],
    ['Ai-gateway/data/ai-gateway.db', 'New API/data/new-api.db-shm'],
    ['New API/data/new-api.db-journal'],
  ]) {
    await t.test(files.join(', '), async (t) => {
      const fixture = desktopFixture(t);
      for (const filename of files) putFile(path.join(fixture.appData, filename));
      await assert.rejects(fixture.startServer(), /set SQLITE_PATH explicitly/);
      assert.equal(fixture.calls.length, 0);
      for (const filename of files) assert.equal(fs.readFileSync(path.join(fixture.appData, filename), 'utf8'), 'preserve');
    });
  }
});

test('non-regular database files are refused', async (t) => {
  const fixture = desktopFixture(t);
  fs.mkdirSync(path.join(fixture.currentData, 'new-api.db'), { recursive: true });
  await assert.rejects(fixture.startServer(), /not a regular file/);
  assert.equal(fixture.calls.length, 0);
});

test('development startup does not inspect or rewrite databases', async (t) => {
  const fixture = desktopFixture(t, { NODE_ENV: 'development' });
  putFile(path.join(fixture.currentData, 'new-api.db-wal'));
  await fixture.startServer();
  assert.equal(fixture.calls.length, 0);
  assert.equal(fixture.env.SQLITE_PATH, undefined);
});
