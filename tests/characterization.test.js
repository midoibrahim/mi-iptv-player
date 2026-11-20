const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function createBrowserEnv(overrides = {}) {
    const store = new Map();
    const localStorage = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
        clear: () => store.clear()
    };

    const sandbox = {
        console,
        setTimeout,
        clearTimeout,
        encodeURIComponent,
        decodeURIComponent,
        Date,
        Map,
        Set,
        Promise,
        Array,
        Object,
        String,
        Number,
        Boolean,
        RegExp,
        Error,
        Math,
        JSON,
        localStorage,
        location: { protocol: 'file:', host: '', origin: '' },
        document: {
            getElementById: () => null,
            querySelector: () => null,
            querySelectorAll: () => [],
            createElement: () => ({
                className: '',
                dataset: {},
                style: {},
                classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
                addEventListener() {},
                appendChild() {},
                setAttribute() {}
            }),
            createDocumentFragment: () => ({ appendChild() {} }),
            body: { classList: { add() {}, remove() {}, contains() { return false; } } },
            documentElement: { setAttribute() {} },
            contains: () => true,
            addEventListener() {}
        },
        ...overrides
    };
    sandbox.window = sandbox;
    sandbox.window.IPTV = sandbox.window.IPTV || {};
    return sandbox;
}

function loadScript(sandbox, relPath) {
    const full = path.join(ROOT, relPath);
    const code = fs.readFileSync(full, 'utf8');
    vm.runInNewContext(code, sandbox, { filename: relPath });
}

test('M3UParser.parseExtinf extracts title, groupTitle, and tvgLogo', () => {
    const env = createBrowserEnv();
    loadScript(env, 'IPTVPlayer/js/services/m3uParser.js');
    const { M3UParser } = env.window.IPTV;

    const meta = M3UParser.parseExtinf(
        '#EXTINF:-1 tvg-id="bbc1" tvg-logo="http://img.test/logo.png" group-title="UK Entertainment",BBC One FHD'
    );
    assert.equal(meta.title, 'BBC One FHD');
    assert.equal(meta.groupTitle, 'UK Entertainment');
    assert.equal(meta.tvgLogo, 'http://img.test/logo.png');
});

test('M3UParser.load classifies live, movies, and series and builds categories', async () => {
    const sampleM3U = [
        '#EXTM3U',
        '#EXTINF:-1 tvg-logo="http://logo/1.png" group-title="News",CNN HD',
        'http://stream.example.com/live/101.ts',
        '#EXTINF:-1 tvg-logo="http://logo/2.png" group-title="Action Movies",Matrix 4K',
        'http://stream.example.com/vod/matrix.mp4',
        '#EXTINF:-1 tvg-logo="http://logo/3.png" group-title="Sci-Fi Series",Expanse S01E01',
        'http://stream.example.com/series/expanse/s01e01.mkv'
    ].join('\n');

    const env = createBrowserEnv({
        fetch: async () => ({
            ok: true,
            status: 200,
            text: async () => sampleM3U
        })
    });
    loadScript(env, 'IPTVPlayer/js/services/m3uParser.js');

    const data = await env.window.IPTV.M3UParser.load('http://example.com/list.m3u');
    assert.equal(data.liveChannels.length, 1);
    assert.equal(data.liveChannels[0].name, 'CNN HD');
    assert.equal(data.liveChannels[0].hd, true);
    assert.equal(data.liveChannels[0].type, 'live');
    assert.equal(data.liveChannels[0]._idx, 0);

    assert.equal(data.movies.length, 1);
    assert.equal(data.movies[0].name, 'Matrix 4K');
    assert.equal(data.movies[0].type, 'movie');
    assert.equal(data.series.length, 1);
    assert.equal(data.series[0].name, 'Expanse S01E01');
    assert.equal(data.series[0].type, 'series');
});

test('XtreamService.buildCatMap and loadAll generate expected stream URLs', async () => {
    const mockResponses = {
        'http://xtream.test:8080/player_api.php?username=alice&password=secret': {
            user_info: { username: 'alice', status: 'Active' }
        },
        'http://xtream.test:8080/player_api.php?username=alice&password=secret&action=get_live_categories': [
            { category_id: '10', category_name: 'Sports' }
        ],
        'http://xtream.test:8080/player_api.php?username=alice&password=secret&action=get_vod_categories': [
            { category_id: '20', category_name: 'Drama' }
        ],
        'http://xtream.test:8080/player_api.php?username=alice&password=secret&action=get_series_categories': [
            { category_id: '30', category_name: 'Shows' }
        ],
        'http://xtream.test:8080/player_api.php?username=alice&password=secret&action=get_live_streams': [
            { stream_id: 501, name: 'Sky Sports FHD', category_id: '10', stream_icon: 'http://img/sky.png' }
        ],
        'http://xtream.test:8080/player_api.php?username=alice&password=secret&action=get_vod_streams': [
            { stream_id: 601, name: 'Inception', category_id: '20', container_extension: 'mkv', stream_icon: 'http://img/inc.jpg' }
        ],
        'http://xtream.test:8080/player_api.php?username=alice&password=secret&action=get_series': [
            { series_id: 701, name: 'Severance', category_id: '30', cover: 'http://img/sev.jpg' }
        ]
    };

    const env = createBrowserEnv({
        fetch: async (url) => ({
            ok: true,
            status: 200,
            json: async () => mockResponses[url] || []
        })
    });
    loadScript(env, 'IPTVPlayer/js/services/xtreamService.js');

    const conn = { type: 'xtream', server: 'http://xtream.test:8080/', user: 'alice', pass: 'secret' };
    const result = await env.window.IPTV.XtreamService.loadAll(conn);

    assert.equal(result.liveChannels.length, 1);
    assert.equal(result.liveChannels[0].url, 'http://xtream.test:8080/live/alice/secret/501.ts');
    assert.equal(result.liveChannels[0].hlsUrl, 'http://xtream.test:8080/live/alice/secret/501.m3u8');
    assert.equal(result.liveChannels[0].fallbackUrl, 'http://xtream.test:8080/alice/secret/501');
    assert.equal(result.liveChannels[0].category, 'Sports');

    assert.equal(result.movies.length, 1);
    assert.equal(result.movies[0].url, 'http://xtream.test:8080/movie/alice/secret/601.mkv');
    assert.equal(result.movies[0].category, 'Drama');

    assert.equal(result.series.length, 1);
    assert.equal(result.series[0].id, '701');
    assert.equal(result.series[0].category, 'Shows');

    const { XtreamService } = env.window.IPTV;
    assert.equal(XtreamService.streamUrl(conn, 'series', 9001, 'mkv'), 'http://xtream.test:8080/series/alice/secret/9001.mkv');
    assert.equal(XtreamService.resolveEpisodeUrl(conn, { id: 9002, container_extension: 'mp4' }), 'http://xtream.test:8080/series/alice/secret/9002.mp4');
    assert.equal(XtreamService.resolveEpisodeUrl(conn, { id: 9003, url: 'http://custom/ep.mp4' }), 'http://custom/ep.mp4');
});

test('PlayerService._getCandidateStrategy & _buildCandidateUrls preserve priority and preferred strategy promotion', () => {
    const env = createBrowserEnv({
        MediaSource: function MediaSource() {}
    });
    loadScript(env, 'IPTVPlayer/js/core/storage.js');
    loadScript(env, 'IPTVPlayer/js/core/catalogStore.js');
    loadScript(env, 'IPTVPlayer/js/services/tvServer.js');
    loadScript(env, 'IPTVPlayer/js/services/streamResolver.js');
    loadScript(env, 'IPTVPlayer/js/services/playerService.js');

    const { PlayerService, StreamResolver, Storage, CatalogStore } = env.window.IPTV;
    const conn = { type: 'xtream', server: 'http://xtream.test:8080', user: 'alice', pass: 'secret' };
    CatalogStore.setConnection(conn);
    PlayerService.app = { connection: conn };

    // Test pure StreamResolver directly with explicit env (no globals needed)
    const vodItem = { type: 'movie', url: 'http://xtream.test:8080/movie/alice/secret/601.mp4' };
    const vodCandidates = Array.from(StreamResolver.buildCandidates(vodItem, {
        canUseMse: true,
        canUseLocalProxy: true,
        proxyBase: 'http://127.0.0.1:8089/api/proxy?url=',
        localFilePath: 'C:\\Downloads\\Movie.mp4'
    }));
    assert.deepEqual(vodCandidates, [
        'file:///C:/Downloads/Movie.mp4',
        'http://xtream.test:8080/movie/alice/secret/601.mp4',
        'http://127.0.0.1:8089/api/proxy?url=http%3A%2F%2Fxtream.test%3A8080%2Fmovie%2Falice%2Fsecret%2F601.mp4'
    ]);
    assert.equal(vodItem._isLocalPlayback, true);

    assert.equal(PlayerService._getCandidateStrategy('mse-hls:http://x/1.m3u8'), 'mse-hls');
    assert.equal(PlayerService._getCandidateStrategy('mse-ts:http://x/1.ts'), 'mse-ts');
    assert.equal(PlayerService._getCandidateStrategy('http://x/1.m3u8'), 'native-hls');
    assert.equal(PlayerService._getCandidateStrategy('http://x/1.ts'), 'native-ts');
    assert.equal(PlayerService._getCandidateStrategy('http://127.0.0.1:8089/api/proxy?url=http%3A%2F%2Fx%2F1.m3u8'), 'proxy-hls');

    const liveItem = {
        type: 'live',
        url: 'http://xtream.test:8080/live/alice/secret/501.ts',
        hlsUrl: 'http://xtream.test:8080/live/alice/secret/501.m3u8',
        fallbackUrl: 'http://xtream.test:8080/alice/secret/501'
    };

    const defaultList = Array.from(PlayerService._buildCandidateUrls(liveItem));
    assert.deepEqual(defaultList, [
        'mse-hls:http://xtream.test:8080/live/alice/secret/501.m3u8',
        'http://xtream.test:8080/live/alice/secret/501.m3u8',
        'mse-ts:http://xtream.test:8080/live/alice/secret/501.ts',
        'http://xtream.test:8080/live/alice/secret/501.ts',
        'http://xtream.test:8080/alice/secret/501'
    ]);

    // Save preferred strategy 'mse-ts' and verify it promotes to index 0
    Storage.saveStreamStrategy(conn, 'mse-ts');
    const promotedList = PlayerService._buildCandidateUrls(liveItem);
    assert.equal(promotedList[0], 'mse-ts:http://xtream.test:8080/live/alice/secret/501.ts');
    assert.equal(promotedList.length, 5);
});

test('IPTVApp prevChannel and nextChannel wrap around and ignore VOD', () => {
    const env = createBrowserEnv();
    loadScript(env, 'IPTVPlayer/js/core/theme.js');
    loadScript(env, 'IPTVPlayer/js/core/storage.js');
    loadScript(env, 'IPTVPlayer/js/core/keyHandler.js');
    loadScript(env, 'IPTVPlayer/js/views/browseView.js');
    loadScript(env, 'IPTVPlayer/js/app.js');

    const proto = env.window.IPTVApp
        ? env.window.IPTVApp.prototype
        : vm.runInNewContext('IPTVApp.prototype', env);

    const played = [];
    const channels = [
        { id: '1', name: 'Ch 1', type: 'live', _idx: 0 },
        { id: '2', name: 'Ch 2', type: 'live', _idx: 1 },
        { id: '3', name: 'Ch 3', type: 'live', _idx: 2 }
    ];
    const mockApp = Object.assign(Object.create(proto), {
        store: { getLive: () => channels },
        currentChannelIndex: 0,
        playerService: {
            currentItem: { id: '1', type: 'live', _idx: 0 },
            play(item) {
                this.currentItem = item;
                played.push(item.id);
            }
        }
    });

    mockApp.prevChannel();
    assert.equal(mockApp.currentChannelIndex, 2);
    assert.equal(played.at(-1), '3');

    mockApp.nextChannel();
    assert.equal(mockApp.currentChannelIndex, 0);
    assert.equal(played.at(-1), '1');

    // Should not step when playing a movie
    mockApp.playerService.currentItem = { id: 'm1', type: 'movie' };
    mockApp.nextChannel();
    assert.equal(mockApp.currentChannelIndex, 0);
    assert.equal(played.length, 2);
});

test('TvServer.getSetupInfo and pollCredentials resolve LAN URL and credentials', async () => {
    const env = createBrowserEnv({
        fetch: async (url) => {
            if (url === 'http://127.0.0.1:8089/api/info') {
                return {
                    ok: true,
                    json: async () => ({ ip: '192.168.1.55', port: 8089, setupUrl: 'http://192.168.1.55:8089/setup.html' })
                };
            }
            if (url === 'http://127.0.0.1:8089/api/credentials') {
                return {
                    ok: true,
                    json: async () => ({
                        status: 'available',
                        credentials: { type: 'm3u', name: 'Phone List', url: 'http://test/list.m3u' }
                    })
                };
            }
            throw new Error('Unexpected URL: ' + url);
        }
    });
    loadScript(env, 'IPTVPlayer/js/services/tvServer.js');

    const { TvServer } = env.window.IPTV;
    const info = await TvServer.getSetupInfo(() => true);
    assert.equal(info.setupUrl, 'http://192.168.1.55:8089/setup.html');
    assert.equal(info.apiBase, 'http://127.0.0.1:8089');

    const creds = await TvServer.pollCredentials();
    assert.equal(creds.type, 'm3u');
    assert.equal(creds.name, 'Phone List');
});

test('EventBus pub/sub and toast helper dispatch events and support unsubscribe', () => {
    const env = createBrowserEnv();
    loadScript(env, 'IPTVPlayer/js/core/eventBus.js');
    const { EventBus } = env.window.IPTV;

    const received = [];
    const unsub = EventBus.on('ui:toast', (payload) => received.push(payload));
    EventBus.toast('Saved!', 1500);
    assert.equal(received.length, 1);
    assert.equal(received[0].message, 'Saved!');
    assert.equal(received[0].duration, 1500);

    unsub();
    EventBus.toast('Ignored');
    assert.equal(received.length, 1);
});

test('CatalogStore manages catalog state, favorites persistence, and events', () => {
    const env = createBrowserEnv();
    loadScript(env, 'IPTVPlayer/js/core/eventBus.js');
    loadScript(env, 'IPTVPlayer/js/core/storage.js');
    loadScript(env, 'IPTVPlayer/js/core/catalogStore.js');

    const { CatalogStore } = env.window.IPTV;
    CatalogStore.init();

    const conn = { type: 'xtream', server: 'http://s.test', user: 'u', pass: 'p' };
    const ch1 = { id: '10', name: 'Sports 1', type: 'live' };
    const mov1 = { id: '20', name: 'Movie 1', type: 'movie' };

    CatalogStore.setCatalog(conn, {
        liveChannels: [ch1],
        movies: [mov1],
        series: [],
        categories: { live: [{ category_id: '1', category_name: 'Sports' }], movies: [], series: [] }
    });

    assert.equal(CatalogStore.getConnection().server, 'http://s.test');
    assert.equal(CatalogStore.getLive().length, 1);
    assert.equal(CatalogStore.isFavorite(ch1), false);

    CatalogStore.toggleFavorite(ch1);
    assert.equal(CatalogStore.isFavorite(ch1), true);
    assert.equal(CatalogStore.getFavoriteItems().length, 1);

    CatalogStore.toggleFavorite(ch1);
    assert.equal(CatalogStore.isFavorite(ch1), false);
    assert.equal(CatalogStore.getFavoriteItems().length, 0);

    CatalogStore.clear();
    assert.equal(CatalogStore.getLive().length, 0);
    assert.equal(CatalogStore.getConnection(), null);
});

test('BackStack executes LIFO transient handlers and priority-ordered guards across all 7 UI states', () => {
    const elements = new Map();
    const makeEl = (active = false, hidden = true) => ({
        _active: active,
        _hidden: hidden,
        classList: {
            contains(cls) {
                if (cls === 'active') return this._owner._active;
                if (cls === 'hidden') return this._owner._hidden;
                return false;
            },
            add(cls) {
                if (cls === 'active') this._owner._active = true;
                if (cls === 'hidden') this._owner._hidden = true;
            },
            remove(cls) {
                if (cls === 'active') this._owner._active = false;
                if (cls === 'hidden') this._owner._hidden = false;
            }
        },
        querySelector: () => null
    });
    for (const id of [
        'continue-watching-modal',
        'profile-delete-modal',
        'player-screen',
        'series-detail-screen',
        'login-form-page',
        'main-shell',
        'login-screen'
    ]) {
        const el = makeEl(false, true);
        el.classList._owner = el;
        elements.set(id, el);
    }

    const env = createBrowserEnv({
        document: {
            getElementById: (id) => elements.get(id) || null,
            querySelector: () => null,
            querySelectorAll: () => [],
            body: { classList: { contains: () => false, remove() {} } },
            documentElement: { setAttribute() {} },
            addEventListener() {}
        }
    });
    loadScript(env, 'IPTVPlayer/js/core/backStack.js');
    loadScript(env, 'IPTVPlayer/js/core/keyHandler.js');
    loadScript(env, 'IPTVPlayer/js/app.js');

    const proto = env.window.IPTVApp
        ? env.window.IPTVApp.prototype
        : vm.runInNewContext('IPTVApp.prototype', env);

    const log = [];
    let exited = false;
    env.window.IPTV.KeyHandler.exitApp = () => { exited = true; };

    const mockApp = Object.assign(Object.create(proto), {
        currentSection: 'movies',
        homeView: { closeResumeModal: () => { elements.get('continue-watching-modal')._hidden = true; log.push('close-cw'); } },
        loginView: {
            closeDeleteModal: () => { elements.get('profile-delete-modal')._hidden = true; log.push('close-del'); },
            showProfilesPage: () => { elements.get('login-form-page')._active = false; log.push('show-profiles'); }
        },
        playerService: {
            isChannelDrawerOpen: true,
            isVisible: () => elements.get('player-screen')._active,
            closeChannelDrawer: function() { this.isChannelDrawerOpen = false; log.push('close-drawer'); },
            close: () => { elements.get('player-screen')._active = false; log.push('close-player'); }
        },
        seriesDetailView: {
            close: () => { elements.get('series-detail-screen')._active = false; log.push('close-series'); }
        },
        navigateTo: function(sec) { this.currentSection = sec; log.push('nav-' + sec); }
    });

    mockApp._registerBackGuards();

    // Activate all layers simultaneously and verify exact precedence from top to bottom
    elements.get('continue-watching-modal')._hidden = false;
    elements.get('profile-delete-modal')._hidden = false;
    elements.get('player-screen')._active = true;
    elements.get('series-detail-screen')._active = true;
    elements.get('login-form-page')._active = true;
    elements.get('main-shell')._active = true;

    assert.equal(mockApp.goBack(), true); // 1. continue-watching-modal
    assert.equal(mockApp.goBack(), true); // 2. profile-delete-modal
    assert.equal(mockApp.goBack(), true); // 3. player channel drawer
    assert.equal(mockApp.goBack(), true); // 4. player screen
    assert.equal(mockApp.goBack(), true); // 5. series-detail-screen
    assert.equal(mockApp.goBack(), true); // 6. login-form-page
    assert.equal(mockApp.goBack(), true); // 7a. main-shell non-home -> home
    assert.equal(mockApp.goBack(), true); // 7b. main-shell home -> login profiles
    assert.equal(mockApp.goBack(), false); // 8. root -> exitApp
    assert.equal(exited, true);

    assert.deepEqual(log, [
        'close-cw',
        'close-del',
        'close-drawer',
        'close-player',
        'close-series',
        'show-profiles',
        'nav-home',
        'show-profiles'
    ]);
});

test('WatchProgressTracker computes cross-season episode adjacency and advances series on 95% completion', () => {
    const env = createBrowserEnv();
    loadScript(env, 'IPTVPlayer/js/core/storage.js');
    loadScript(env, 'IPTVPlayer/js/core/catalogStore.js');
    loadScript(env, 'IPTVPlayer/js/services/watchProgressTracker.js');

    const { WatchProgressTracker, CatalogStore, Storage } = env.window.IPTV;
    const conn = { type: 'xtream', server: 'http://s.test', user: 'u', pass: 'p' };
    CatalogStore.setConnection(conn);

    const seasonsData = {
        '1': [{ id: 'ep1', episode_num: 1, title: 'Pilot' }, { id: 'ep2', episode_num: 2, title: 'Finale S1' }],
        '2': [{ id: 'ep3', episode_num: 1, title: 'Premiere S2' }]
    };

    const adjEndS1 = WatchProgressTracker.getAdjacentEpisodes({
        seriesId: '50',
        seriesName: 'Dark',
        seasonsData,
        currentSeason: '1',
        currentEpisodeIndex: 1
    });

    assert.equal(adjEndS1.hasPrev, true);
    assert.equal(adjEndS1.prevSeason, '1');
    assert.equal(adjEndS1.prevIndex, 0);
    assert.equal(adjEndS1.hasNext, true);
    assert.equal(adjEndS1.nextSeason, '2');
    assert.equal(adjEndS1.nextIndex, 0);
    assert.equal(adjEndS1.nextEpisode.id, 'ep3');

    // Record 96% progress on S1E2 -> should auto-advance watch progress record to S2E1
    const epItem = {
        id: 'series_50_ep2',
        name: 'Dark - S1 E2',
        type: 'series',
        seriesContext: {
            seriesId: '50',
            seriesName: 'Dark',
            poster: 'http://img/dark.jpg',
            seasonsData,
            currentSeason: '1',
            currentEpisodeIndex: 1,
            currentEpisodeNum: 2,
            currentEpisodeId: 'ep2'
        }
    };

    WatchProgressTracker.recordProgress(epItem, 960, 1000, false);
    const saved = Storage.getWatchProgress(conn);
    assert.equal(saved.length, 1);
    assert.equal(saved[0].seasonNum, '2');
    assert.equal(saved[0].episodeNum, 1);
    assert.equal(saved[0].episodeId, 'ep3');
    assert.equal(saved[0].position, 0);
});

test('Platform adapter detects capabilities and delegates exitApp and fullscreen', () => {
    let platformBackCalled = false;
    let toggledFs = false;
    const env = createBrowserEnv({
        webOS: { platformBack: () => { platformBackCalled = true; } },
        electronDesktop: {
            downloads: { getAll: () => [] },
            toggleFullScreen: () => { toggledFs = true; }
        }
    });
    loadScript(env, 'IPTVPlayer/js/core/platform.js');
    const { Platform } = env.window.IPTV;

    assert.equal(Platform.isDesktop(), true);
    assert.equal(Platform.hasDownloads(), true);
    assert.equal(Platform.isWebOS(), true);

    Platform.toggleFullScreen();
    assert.equal(toggledFs, true);

    Platform.exitApp();
    assert.equal(platformBackCalled, true);
});

test('companionCore.createCompanionHandler serves /api/info and consume-once /api/credentials', () => {
    const { EventEmitter } = require('node:events');
    const companionCore = require('../IPTVService/companionCore');

    let pollCount = 0;
    let receivedCreds = null;
    const handler = companionCore.createCompanionHandler({
        port: 8089,
        host: 'tv',
        staticDir: path.join(ROOT, 'IPTVPlayer'),
        onPoll: () => { pollCount++; },
        onCredentialsReceived: (c) => { receivedCreds = c; }
    });

    function invoke(method, url, body = null) {
        return new Promise((resolve) => {
            const req = new EventEmitter();
            req.method = method;
            req.url = url;
            req.headers = { host: '127.0.0.1:8089' };
            req.setEncoding = () => {};
            req.destroy = () => {};

            let statusCode = 200;
            let resHeaders = {};
            const res = {
                writeHead(code, h) { statusCode = code; resHeaders = h || {}; },
                end(data) {
                    resolve({
                        statusCode,
                        headers: resHeaders,
                        body: data ? (Buffer.isBuffer(data) ? data.toString('utf8') : String(data)) : ''
                    });
                }
            };

            handler(req, res);
            if (body != null) {
                req.emit('data', typeof body === 'string' ? body : JSON.stringify(body));
                req.emit('end');
            }
        });
    }

    return (async () => {
        const infoRes = await invoke('GET', '/api/info');
        assert.equal(infoRes.statusCode, 200);
        const info = JSON.parse(infoRes.body);
        assert.equal(info.port, 8089);
        assert.equal(info.host, 'tv');
        assert.equal(pollCount, 1);

        const waitRes = await invoke('GET', '/api/credentials');
        assert.deepEqual(JSON.parse(waitRes.body), { status: 'waiting' });
        assert.equal(pollCount, 2);

        const postRes = await invoke('POST', '/api/credentials', { type: 'xtream', name: 'MyProvider' });
        assert.equal(postRes.statusCode, 200);
        assert.equal(receivedCreds.name, 'MyProvider');

        const consumeRes = await invoke('GET', '/api/credentials');
        const consumed = JSON.parse(consumeRes.body);
        assert.equal(consumed.status, 'available');
        assert.equal(consumed.credentials.name, 'MyProvider');

        // Second GET must return 'waiting' (consumed once)
        const afterConsumeRes = await invoke('GET', '/api/credentials');
        assert.deepEqual(JSON.parse(afterConsumeRes.body), { status: 'waiting' });
    })();
});

test('PlayerOsd formats time and updates progress UI elements', () => {
    const fill = { style: {} };
    const thumb = { style: {} };
    const cur = { textContent: '' };
    const dur = { textContent: '' };
    const bar = {
        attrs: {},
        setAttribute(k, v) { this.attrs[k] = v; }
    };
    const env = createBrowserEnv({
        document: {
            getElementById(id) {
                const map = {
                    'osd-progress-bar': bar,
                    'osd-progress-fill': fill,
                    'osd-progress-thumb': thumb,
                    'osd-time-current': cur,
                    'osd-time-duration': dur
                };
                return map[id] || null;
            }
        }
    });
    loadScript(env, 'IPTVPlayer/js/components/playerOsd.js');
    const { PlayerOsd } = env.window.IPTV;

    assert.equal(PlayerOsd.fmtTime(125, 600), '02:05');
    assert.equal(PlayerOsd.fmtTime(3665, 7200), '01:01:05');

    const mockPlayer = {};
    PlayerOsd.updateProgressUI(mockPlayer, 300, 600);
    assert.equal(fill.style.width, '50%');
    assert.equal(thumb.style.left, '50%');
    assert.equal(cur.textContent, '05:00');
    assert.equal(dur.textContent, '10:00');
    assert.equal(bar.attrs['aria-valuenow'], '50');
});

test('DownloadStore tracks active tasks, completed history, and pending episode payloads', () => {
    const env = createBrowserEnv({
        electronDesktop: { downloads: {} }
    });
    loadScript(env, 'IPTVPlayer/js/core/platform.js');
    loadScript(env, 'IPTVPlayer/js/core/catalogStore.js');
    loadScript(env, 'IPTVPlayer/js/services/xtreamService.js');
    loadScript(env, 'IPTVPlayer/js/services/downloadStore.js');

    const { DownloadStore, CatalogStore } = env.window.IPTV;
    CatalogStore.setConnection({ type: 'xtream', server: 'http://x.test:8080', user: 'u', pass: 'p' });

    DownloadStore.applySnapshot({
        settings: { saveDirectory: 'C:\\Downloads', askEveryTime: false },
        active: [{ id: 'dl_1', itemId: 'ep_10_1', url: 'http://x.test:8080/series/u/p/1.mkv', status: 'downloading' }],
        history: [{
            id: 'dl_2',
            itemId: 'ep_10_2',
            seriesName: 'Andor',
            season: '1',
            episode: 2,
            url: 'http://164.37.104.130:2052/series/u/p/2.mkv?token=abc',
            existsOnDisk: true,
            filePath: 'C:\\Downloads\\S01E02.mp4'
        }]
    });

    assert.equal(DownloadStore.isDownloading('ep_10_1'), true);
    assert.equal(DownloadStore.isDownloading('series_10_1'), true);
    assert.equal(DownloadStore.isCompleted('ep_10_2'), true);
    assert.equal(DownloadStore.isCompleted('series_10_2'), true);
    assert.equal(DownloadStore.isCompleted('2'), true);
    assert.ok(DownloadStore.getDownloadedItem({ id: 'series_10_2', url: 'http://x.test:8080/series/u/p/2.mkv' }));

    const pending = DownloadStore.collectPendingEpisodes(
        { id: '10', name: 'Andor', poster: 'http://img/a.jpg' },
        '1',
        [
            { id: '1', episode_num: 1, container_extension: 'mkv' }, // active -> skipped
            { id: '2', episode_num: 2, container_extension: 'mkv' }, // completed -> skipped
            { id: '3', episode_num: 3, container_extension: 'mkv', title: 'Reckoning' } // queued!
        ]
    );
    assert.equal(pending.length, 1);
    assert.equal(pending[0].id, 'ep_10_3');
    assert.equal(pending[0].url, 'http://x.test:8080/series/u/p/3.mkv');
});

test('downloadUtils sanitizes filenames, formats bytes, and resolves nested series paths', () => {
    const os = require('node:os');
    const downloadUtils = require('../windows/downloadUtils');

    assert.equal(downloadUtils.sanitizeFileName('Star Wars: Episode IV / A New Hope?'), 'Star Wars_ Episode IV _ A New Hope_');
    assert.equal(downloadUtils.formatBytes(1048576), '1.00 MB');

    const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'iptv-dl-test-'));
    try {
        const res = downloadUtils.resolveDownloadTarget(tmpBase, {
            seriesName: 'The Bear',
            season: 2,
            episode: 7,
            title: 'Forks',
            url: 'http://stream.test/series/u/p/77.mkv'
        });
        assert.equal(res.finalFileName, 'The Bear - S02E07 - Forks.mkv');
        assert.ok(res.targetDir.endsWith(path.join('The Bear', 'Season 02')));
    } finally {
        fs.rmSync(tmpBase, { recursive: true, force: true });
    }
});

test('Storage.createProfile normalizes Xtream and M3U profiles with default names', () => {
    const env = createBrowserEnv();
    loadScript(env, 'IPTVPlayer/js/core/storage.js');
    const { Storage } = env.window.IPTV;

    const xtreamProf = Storage.createProfile({
        type: 'xtream',
        server: 'http://provider.example.com:8080/c/',
        username: 'bob',
        password: 'pw'
    });
    assert.equal(xtreamProf.name, 'provider.example.com:8080');
    assert.equal(xtreamProf.user, 'bob');
    assert.equal(xtreamProf.pass, 'pw');

    const m3uProf = Storage.createProfile({
        type: 'm3u',
        url: 'http://provider.example.com/playlist.m3u8'
    });
    assert.equal(m3uProf.name, 'M3U Playlist');
    assert.equal(m3uProf.url, 'http://provider.example.com/playlist.m3u8');
});

test('PairingRelay encrypts/decrypts payloads and handles session lifecycle', async () => {
    const env = createBrowserEnv({
        btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
        atob: (s) => Buffer.from(s, 'base64').toString('binary')
    });
    loadScript(env, 'IPTVPlayer/js/services/pairingRelay.js');
    const { PairingRelay } = env.window.IPTV;

    // 1. Encryption / Decryption symmetry (including Unicode / Arabic / symbols)
    const secret = 'MYKEY123';
    const payload = JSON.stringify({
        type: 'xtream',
        name: 'قنوات غرفة المعيشة 📺',
        server: 'http://test.com',
        username: 'u',
        password: 'p'
    });
    const encrypted = PairingRelay.encrypt(payload, secret);
    assert.notEqual(encrypted, payload);
    const decrypted = PairingRelay.decrypt(encrypted, secret);
    assert.equal(decrypted, payload);

    // 2. Mock session creation and polling
    let remoteObject = null;
    env.fetch = async (url, opts = {}) => {
        if (opts.method === 'POST') {
            remoteObject = { id: 'obj-1234', data: JSON.parse(opts.body).data };
            return { ok: true, status: 200, json: async () => remoteObject };
        }
        if (opts.method === 'PUT') {
            remoteObject.data = JSON.parse(opts.body).data;
            return { ok: true, status: 200, json: async () => remoteObject };
        }
        if (opts.method === 'DELETE') {
            remoteObject = null;
            return { ok: true, status: 200 };
        }
        if (remoteObject) {
            return { ok: true, status: 200, json: async () => remoteObject };
        }
        return { ok: false, status: 404 };
    };

    const session = await PairingRelay.createSession('http://test.local/setup.html');
    assert.equal(session.sessionId, 'obj-1234');
    assert.ok(session.pairUrl.includes('obj-1234'));

    // Still waiting -> poll returns null
    const beforeSubmit = await PairingRelay.pollSession();
    assert.equal(beforeSubmit, null);

    // Phone submits encrypted credentials
    const phoneEnc = PairingRelay.encrypt(payload, session.secretKey);
    await env.fetch(PairingRelay.RELAY_ENDPOINT + '/' + session.sessionId, {
        method: 'PUT',
        body: JSON.stringify({ name: 'mi-pairing-session', data: { status: 'ready', payload: phoneEnc } })
    });

    // TV polls -> gets decrypted credentials & deletes session
    const received = await PairingRelay.pollSession();
    assert.deepEqual(received, JSON.parse(payload));
    assert.equal(remoteObject, null); // Session automatically deleted
});

test('PlaybackEngine & StreamResolver handle desktop VOD proxy candidate and initial seek readiness', () => {
    const env = createBrowserEnv({
        electronDesktop: { isFullScreen: () => false }
    });
    loadScript(env, 'IPTVPlayer/js/core/platform.js');
    loadScript(env, 'IPTVPlayer/js/services/streamResolver.js');
    loadScript(env, 'IPTVPlayer/js/services/playbackEngine.js');
    loadScript(env, 'IPTVPlayer/js/services/playerService.js');

    const { Platform, StreamResolver, PlaybackEngine, PlayerService } = env.window.IPTV;

    assert.equal(Platform.isDesktop(), true);

    // Desktop VOD candidate generation includes companion proxy fallback
    const vodItem = { type: 'movie', url: 'http://xtream.test:8080/movie/user/pass/999.mp4' };
    const candidates = StreamResolver.buildCandidates(vodItem);
    assert.equal(candidates.length, 2);
    assert.equal(candidates[0], 'http://xtream.test:8080/movie/user/pass/999.mp4');
    assert.equal(candidates[1], 'http://127.0.0.1:8089/api/proxy?url=' + encodeURIComponent('http://xtream.test:8080/movie/user/pass/999.mp4'));

    // Verify initial seek waits for readyState >= 2
    let seekCalledWith = null;
    PlayerService.video = {
        readyState: 1, // HAVE_METADATA only
        seeking: false,
        currentTime: 0,
        duration: 7200,
        seekable: { length: 1, end: () => 7200 },
        play() { return Promise.resolve(); }
    };
    PlayerService.canSeek = () => true;
    PlayerService.seekTo = (t) => { seekCalledWith = t; };
    PlayerService._initialSeekPending = 3600;

    // Call check while readyState is 1 -> seek should NOT execute yet
    PlayerService._checkPendingInitialSeek();
    assert.equal(seekCalledWith, null);
    assert.equal(PlayerService._initialSeekPending, 3600);

    // Once readyState is 2 (HAVE_CURRENT_DATA) -> seek executes cleanly
    PlayerService.video.readyState = 2;
    PlayerService._checkPendingInitialSeek();
    assert.equal(seekCalledWith, 3600);
    assert.equal(PlayerService._initialSeekPending, null);

    // Verify watchdog does not falsely report hasVideoData if video is still seeking
    let nextCandidateCalled = false;
    PlaybackEngine.tryNextCandidate = () => { nextCandidateCalled = true; };
    const mockPlayer = {
        _loadSessionId: 1,
        visible: true,
        currentItem: vodItem,
        _avplayActive: false,
        _initialSeekPending: null,
        video: {
            readyState: 2,
            seeking: true, // currently seeking to saved offset
            paused: false,
            playbackRate: 1,
            currentTime: 3600
        }
    };
    PlaybackEngine.startWatchdog(mockPlayer, vodItem, 1, 10);

    return new Promise((resolve) => {
        setTimeout(() => {
            assert.equal(nextCandidateCalled, true);
            resolve();
        }, 30);
    });
});

test('PlaybackEngine.getEngineProfile adapts buffer caps for Smart TV vs Desktop', () => {
    const tvEnv = createBrowserEnv({ webOS: {} });
    loadScript(tvEnv, 'IPTVPlayer/js/core/platform.js');
    loadScript(tvEnv, 'IPTVPlayer/js/services/playbackEngine.js');
    const tvProfile = tvEnv.window.IPTV.PlaybackEngine.getEngineProfile();
    assert.equal(tvProfile.enableWorker, false);
    assert.equal(tvProfile.hlsMaxBufferSize, 30 * 1000 * 1000);
    assert.equal(tvProfile.hlsMaxBufferLength, 30);
    assert.equal(tvProfile.hlsBackBufferLength, 15);
    assert.equal(tvProfile.mpegtsLazyLoad, false);
    assert.equal(tvProfile.mpegtsAutoCleanup, true);

    const desktopEnv = createBrowserEnv({
        electronDesktop: {},
        Worker: function MockWorker() {}
    });
    loadScript(desktopEnv, 'IPTVPlayer/js/core/platform.js');
    loadScript(desktopEnv, 'IPTVPlayer/js/services/playbackEngine.js');
    const deskProfile = desktopEnv.window.IPTV.PlaybackEngine.getEngineProfile();
    assert.equal(deskProfile.enableWorker, false);
    assert.equal(deskProfile.hlsMaxBufferSize, 60 * 1000 * 1000);
    assert.equal(deskProfile.hlsMaxBufferLength, 30);
    assert.equal(deskProfile.hlsBackBufferLength, 30);
    assert.equal(deskProfile.mpegtsLazyLoad, false);
    assert.equal(deskProfile.mpegtsAutoCleanup, true);
});

test('IPTVPlayer/index.html defers hls.min.js and mpegts.js out of synchronous boot tags', () => {
    const html = fs.readFileSync(path.join(ROOT, 'IPTVPlayer/index.html'), 'utf8');
    assert.equal(/<script[^>]+src=["']js\/hls\.min\.js["']/.test(html), false);
    assert.equal(/<script[^>]+src=["']js\/mpegts\.js["']/.test(html), false);
});

test('KeyHandler opens Search and focuses editable input on Desktop Ctrl+F without triggering Favorite', () => {
    let focusedCardFavToggled = false;
    let searchFocused = false;
    let searchSelected = false;
    let navigatedTo = null;

    const searchInput = {
        readOnly: true,
        value: '',
        addEventListener() {},
        focus() { searchFocused = true; },
        select() { searchSelected = true; }
    };
    const focusedCard = {
        tagName: 'DIV',
        classList: { contains: (c) => c === 'card' },
        _item: { id: '1', type: 'movie', name: 'Test' }
    };
    const mainShellEl = { classList: { contains: (c) => c === 'active' } };
    const elements = {
        'main-shell': mainShellEl,
        'search-input': searchInput,
        'search-results': {}
    };

    const env = createBrowserEnv({
        electronDesktop: {},
        addEventListener() {}
    });
    env.document.activeElement = focusedCard;
    env.document.getElementById = (id) => elements[id] || null;
    env.window.IPTV.CatalogStore = { toggleFavorite: () => { focusedCardFavToggled = true; } };

    loadScript(env, 'IPTVPlayer/js/core/platform.js');
    loadScript(env, 'IPTVPlayer/js/views/searchView.js');
    loadScript(env, 'IPTVPlayer/js/core/keyHandler.js');

    const { SearchView, KeyHandler } = env.window.IPTV;
    const mockApp = {
        currentSection: 'home',
        navigateTo: (sec) => {
            navigatedTo = sec;
            mockApp.currentSection = sec;
        },
        searchView: SearchView
    };
    SearchView.init(mockApp);
    KeyHandler.app = mockApp;

    let prevented = false;
    let stopped = false;
    KeyHandler.handleKeyDown({
        key: 'f',
        keyCode: 70,
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        preventDefault() { prevented = true; },
        stopPropagation() { stopped = true; }
    });

    assert.equal(navigatedTo, 'search');
    assert.equal(searchInput.readOnly, false);
    assert.equal(searchFocused, true);
    assert.equal(searchSelected, true);
    assert.equal(focusedCardFavToggled, false);
    assert.equal(prevented, true);
    assert.equal(stopped, true);

    // Verify plain F (no Ctrl) still triggers Favorite rather than Search shortcut
    assert.equal(KeyHandler.isDesktopSearchShortcut({ key: 'f', keyCode: 70, ctrlKey: false }), false);
    assert.equal(KeyHandler.isFavoriteKey({ key: 'f', keyCode: 70, ctrlKey: false }), true);
    assert.equal(KeyHandler.isFavoriteKey({ key: 'f', keyCode: 70, ctrlKey: true }), false);
});

test('XtreamService.formatEpisodeTitle and buildEpisodePlayItem normalize titles and build seriesContext', () => {
    const env = createBrowserEnv();
    loadScript(env, 'IPTVPlayer/js/services/xtreamService.js');
    const { XtreamService } = env.window.IPTV;

    assert.equal(XtreamService.formatEpisodeTitle('Lupin - S04E01 - Pilot', 'Lupin', 4, 1), 'Pilot');
    assert.equal(XtreamService.formatEpisodeTitle('Lupin: S04E02', 'Lupin', 4, 2), 'Episode 2');
    assert.equal(XtreamService.formatEpisodeTitle('', 'Lupin', 1, 3), 'Episode 3');

    const conn = { type: 'xtream', server: 'http://tv.test:8080/', user: 'u', pass: 'p' };
    const seriesInfo = { id: '55', name: 'Lupin', poster: 'http://img/lupin.jpg', plot: 'Heist' };
    const seasonsData = {
        '1': [
            { id: '901', episode_num: 1, title: 'Lupin - S01E01 - Chapter 1', container_extension: 'mkv', info: { movie_image: 'http://img/ep1.jpg' } }
        ]
    };

    const item = XtreamService.buildEpisodePlayItem(conn, seriesInfo, seasonsData, '1', 0);
    assert.equal(item.id, 'series_55_901');
    assert.equal(item.name, 'Lupin - S1 E1: Chapter 1');
    assert.equal(item.type, 'series');
    assert.equal(item.url, 'http://tv.test:8080/series/u/p/901.mkv');
    assert.equal(item.logo, 'http://img/ep1.jpg');
    assert.equal(item.seriesContext.seriesId, '55');
    assert.equal(item.seriesContext.currentSeason, '1');
    assert.equal(item.seriesContext.currentEpisodeIndex, 0);
    assert.equal(item.seriesContext.currentEpisodeId, '901');
    assert.equal(item.seriesContext.currentEpisodeNum, 1);
    assert.equal(item.seriesContext.currentEpisodeTitle, 'Chapter 1');
});

test('downloadUtils.matchesDownloadItem and createSegments handle IDs, episodes, and byte ranges', () => {
    const downloadUtils = require(path.join(ROOT, 'windows/downloadUtils.js'));

    const record = {
        id: 'dl_100',
        itemId: 'ep_55_901',
        url: 'http://tv.test/series/u/p/901.mkv',
        seriesName: 'Lupin',
        season: 1,
        episode: 1
    };

    assert.equal(downloadUtils.matchesDownloadItem(record, 'dl_100'), true);
    assert.equal(downloadUtils.matchesDownloadItem(record, 'series_55_901'), true);
    assert.equal(downloadUtils.matchesDownloadItem(record, '901'), true);
    assert.equal(downloadUtils.matchesDownloadItem(record, { url: 'http://tv.test/series/u/p/901.mkv' }), true);
    assert.equal(downloadUtils.matchesDownloadItem(record, { seriesName: 'lupin', season: '1', episode: 1 }), true);
    assert.equal(downloadUtils.matchesDownloadItem(record, { seriesName: 'lupin', season: '1', episode: 2 }), false);

    const smallSegs = downloadUtils.createSegments(1024);
    assert.equal(smallSegs.length, 4);
    assert.equal(smallSegs[0].start, 0);
    assert.equal(smallSegs[smallSegs.length - 1].end, 1023);

    const mediumSegs = downloadUtils.createSegments(25 * 1024 * 1024);
    assert.equal(mediumSegs.length, 6);
    assert.equal(mediumSegs[mediumSegs.length - 1].end, 25 * 1024 * 1024 - 1);

    const largeSegs = downloadUtils.createSegments(120 * 1024 * 1024);
    assert.equal(largeSegs.length, 8);
    assert.equal(largeSegs[0].status, 'active');
    assert.equal(largeSegs[1].status, 'pending');
    assert.equal(largeSegs[largeSegs.length - 1].end, 120 * 1024 * 1024 - 1);

    // saveSegmentMeta / loadSegmentMeta strip per-connection ?token= URLs back to task.url
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'iptv-dl-'));
    try {
        const partPath = path.join(tmpDir, 'ep6.mkv.part');
        const metaPath = partPath + '.meta.json';
        fs.writeFileSync(partPath, 'partial');
        const tokenizedTask = {
            url: 'http://tv.test:8080/series/u/p/241874.mkv',
            resolvedUrl: 'http://cdn.edge:2052/stream/241874.mkv?token=abc123&exp=999',
            totalBytes: 4000,
            maxConnections: 1,
            partPath,
            metaPath,
            segments: downloadUtils.createSegments(4000)
        };
        downloadUtils.saveSegmentMeta(tokenizedTask);
        const saved = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        assert.equal(saved.resolvedUrl, tokenizedTask.url);

        // Even if an older meta file on disk stored a token URL, loadSegmentMeta falls back to task.url
        saved.resolvedUrl = 'http://cdn.edge:2052/stream/241874.mkv?foo=1&token=expired';
        fs.writeFileSync(metaPath, JSON.stringify(saved), 'utf8');
        const resumedTask = {
            url: tokenizedTask.url,
            resolvedUrl: null,
            partPath,
            metaPath
        };
        assert.equal(downloadUtils.loadSegmentMeta(resumedTask), true);
        assert.equal(resumedTask.resolvedUrl, tokenizedTask.url);
        assert.equal(resumedTask.maxConnections, 1);
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

test('PlaybackEngine cleans up video listeners, deduplicates seeked handlers, and handles suspend/restore lifecycle', () => {
    let avplaySuspended = false;
    let avplayRestored = false;
    let avplayPlayed = false;

    const env = createBrowserEnv({
        webapis: {
            avplay: {
                suspend: () => { avplaySuspended = true; },
                restore: () => { avplayRestored = true; },
                play: () => { avplayPlayed = true; },
                pause: () => {},
                stop: () => {},
                close: () => {}
            }
        }
    });
    loadScript(env, 'IPTVPlayer/js/core/platform.js');
    loadScript(env, 'IPTVPlayer/js/services/playbackEngine.js');
    const { PlaybackEngine } = env.window.IPTV;

    const listeners = new Map();
    const mockVideo = {
        paused: false,
        seeking: true,
        currentTime: 10,
        duration: 120,
        style: {},
        playCount: 0,
        pauseCount: 0,
        addEventListener(type, fn) {
            if (!listeners.has(type)) listeners.set(type, new Set());
            listeners.get(type).add(fn);
        },
        removeEventListener(type, fn) {
            if (listeners.has(type)) listeners.get(type).delete(fn);
        },
        pause() { this.pauseCount++; this.paused = true; },
        play() { this.playCount++; this.paused = false; return Promise.resolve(); },
        load() {},
        removeAttribute() {},
        firstChild: null
    };

    const player = {
        video: mockVideo,
        visible: true,
        _userPaused: false,
        _avplayActive: false,
        _loadSessionId: 1,
        _initialSeekPending: null,
        _updatePlayPauseIcon() {},
        _updateProgress() {},
        _markCandidateSuccess() {}
    };

    // 1. playNativeDirect adds playing/loadeddata/seeked and destroy removes ALL of them
    PlaybackEngine.playNativeDirect(player, 'http://test.tv/movie.mp4', { id: '1' }, 'http://test.tv/movie.mp4', 1);
    assert.equal(listeners.get('playing').size, 1);
    assert.equal(listeners.get('loadeddata').size, 1);
    assert.equal(listeners.get('seeked').size, 1);

    PlaybackEngine.destroy(player);
    assert.equal(listeners.get('playing').size, 0);
    assert.equal(listeners.get('loadeddata').size, 0);
    assert.equal(listeners.get('seeked').size, 0);

    // 2. Rapid seekTo replaces prior pending seeked listener instead of stacking
    PlaybackEngine.seekTo(player, 20, true);
    PlaybackEngine.seekTo(player, 40, true);
    PlaybackEngine.seekTo(player, 60, true);
    assert.equal(listeners.get('seeked').size, 1);
    PlaybackEngine.destroy(player);
    assert.equal(listeners.get('seeked').size, 0);

    // 3. HTML5/HLS visibility suspend & restore
    let hlsStopped = false;
    let hlsStarted = false;
    player.hls = { stopLoad: () => { hlsStopped = true; }, startLoad: () => { hlsStarted = true; }, destroy: () => {} };
    mockVideo.paused = false;
    mockVideo.pauseCount = 0;
    mockVideo.playCount = 0;
    PlaybackEngine.suspend(player);
    assert.equal(hlsStopped, true);
    assert.equal(mockVideo.pauseCount, 1);
    assert.equal(player._wasPlayingBeforeHidden, true);

    PlaybackEngine.restore(player);
    assert.equal(hlsStarted, true);
    assert.equal(mockVideo.playCount, 1);

    // User-paused stream stays paused on restore
    player._userPaused = true;
    mockVideo.playCount = 0;
    PlaybackEngine.suspend(player);
    assert.equal(player._wasPlayingBeforeHidden, false);
    PlaybackEngine.restore(player);
    assert.equal(mockVideo.playCount, 0);

    // 4. Tizen AVPlay visibility suspend & restore
    player._avplayActive = true;
    player._avplayPaused = false;
    player._userPaused = false;
    PlaybackEngine.suspend(player);
    assert.equal(avplaySuspended, true);
    assert.equal(player._avplayPaused, true);
    PlaybackEngine.restore(player);
    assert.equal(avplayRestored, true);
    assert.equal(avplayPlayed, true);
    assert.equal(player._avplayPaused, false);
});

test('CatalogCache tracks TTL freshness/_idx and BrowseView/Card reclaim resources cleanly', async () => {
    let ioDisconnected = false;
    const sectionEl = {
        classList: { contains: (c) => c === 'active' },
        innerHTML: '<div>cached</div>',
        querySelector: () => null,
        querySelectorAll: () => []
    };

    const env = createBrowserEnv({
        IntersectionObserver: function MockIO() {
            return {
                observe() {},
                unobserve() {},
                disconnect() { ioDisconnected = true; }
            };
        },
        indexedDB: {
            open() {
                const req = {};
                setTimeout(() => {
                    const storeData = new Map();
                    const fakeDb = {
                        objectStoreNames: { contains: () => true },
                        transaction() {
                            const tx = {
                                oncomplete: null,
                                onerror: null,
                                objectStore() {
                                    return {
                                        put(val, k) {
                                            storeData.set(k, val);
                                            setTimeout(() => tx.oncomplete && tx.oncomplete(), 0);
                                        },
                                        get(k) {
                                            const gReq = {};
                                            setTimeout(() => {
                                                gReq.result = storeData.get(k);
                                                gReq.onsuccess && gReq.onsuccess();
                                            }, 0);
                                            return gReq;
                                        }
                                    };
                                }
                            };
                            return tx;
                        }
                    };
                    req.onsuccess && req.onsuccess({ target: { result: fakeDb } });
                }, 0);
                return req;
            }
        }
    });
    env.window.document.getElementById = (id) => (id === 'section-movies' ? sectionEl : null);

    loadScript(env, 'IPTVPlayer/js/core/storage.js');
    loadScript(env, 'IPTVPlayer/js/components/card.js');
    loadScript(env, 'IPTVPlayer/js/views/browseView.js');

    const { CatalogCache, Card, BrowseView } = env.window.IPTV;

    assert.equal(CatalogCache.isFresh({ timestamp: Date.now() - 5 * 60 * 1000 }), true);
    assert.equal(CatalogCache.isFresh({ timestamp: Date.now() - 45 * 60 * 1000 }), false);
    assert.equal(CatalogCache.isFresh(null), false);

    const conn = { type: 'm3u', url: 'http://tv.test/list.m3u' };
    await CatalogCache.set(conn, {
        liveChannels: [{ id: 'c1', name: 'One', url: 'http://s/1.ts' }],
        movies: [],
        series: [],
        categories: { live: [], movies: [], series: [] }
    });
    const loaded = await CatalogCache.get(conn);
    assert.equal(loaded.liveChannels[0]._idx, 0);

    // Card._io disconnect on clearLazyQueue
    Card._immediateQuota = 0;
    Card._scheduleLazyImg({ dataset: {}, style: {} }, 'http://img/poster.jpg');
    Card.clearLazyQueue();
    assert.equal(ioDisconnected, true);

    // BrowseView preserveState & clear
    const view = new BrowseView('movies', { title: 'Movies', cardType: 'movie', unitName: 'movies', app: {} });
    view._isRendered = true;
    view.selectedCategory = 'Sci-Fi';
    view.setData([{ id: 'm1', name: 'Dune', category: 'Sci-Fi' }], [{ category_name: 'Sci-Fi' }], { preserveState: true });
    assert.equal(view.selectedCategory, 'Sci-Fi');
    assert.equal(view._byCategory['Sci-Fi'].length, 1);

    view.clear();
    assert.equal(view.items.length, 0);
    assert.equal(view._isRendered, false);
    assert.equal(sectionEl.innerHTML, '');
});

test('companionCore caps oversized .m3u8 proxy manifests at 2MB to prevent OOM', async () => {
    const http = require('http');
    const companionCore = require('../IPTVService/companionCore');

    // Upstream server sending > 2 MB for an .m3u8 URL
    const upstreamServer = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
        const chunk = Buffer.alloc(512 * 1024, 'A');
        for (let i = 0; i < 6; i++) {
            res.write(chunk);
        }
        res.end();
    });

    await new Promise((resolve) => upstreamServer.listen(0, '127.0.0.1', resolve));
    const upstreamPort = upstreamServer.address().port;

    const handler = companionCore.createCompanionHandler({ port: 8089, host: 'test' });
    const proxyServer = http.createServer(handler);
    await new Promise((resolve) => proxyServer.listen(0, '127.0.0.1', resolve));
    const proxyPort = proxyServer.address().port;

    try {
        const targetUrl = encodeURIComponent(`http://127.0.0.1:${upstreamPort}/huge.m3u8`);
        const result = await new Promise((resolve, reject) => {
            http.get(`http://127.0.0.1:${proxyPort}/api/proxy?url=${targetUrl}`, (resp) => {
                let body = '';
                resp.on('data', (d) => { body += d.toString(); });
                resp.on('end', () => resolve({ status: resp.statusCode, body }));
            }).on('error', reject);
        });

        assert.equal(result.status, 502);
        const parsed = JSON.parse(result.body);
        assert.match(parsed.error, /maximum size limit/i);
    } finally {
        upstreamServer.close();
        proxyServer.close();
    }
});














test('PlaybackEngine stall monitor jumps mpegts buffer gaps, defers to Hls.js gap control, and self-stops on stale sessions', async () => {
    const env = createBrowserEnv({ setInterval, clearInterval });
    loadScript(env, 'IPTVPlayer/js/core/platform.js');
    loadScript(env, 'IPTVPlayer/js/services/playbackEngine.js');
    const { PlaybackEngine } = env.window.IPTV;

    const ranges = [[0, 10], [10.6, 30]];
    const video = {
        paused: false,
        seeking: false,
        currentTime: 10.2,
        buffered: { length: 2, start: (i) => ranges[i][0], end: (i) => ranges[i][1] },
        addEventListener() {},
        removeEventListener() {}
    };
    const item = { id: 'live1', type: 'live' };
    const player = {
        video,
        visible: true,
        currentItem: item,
        _loadSessionId: 7,
        _streamStarted: true,
        _userPaused: false,
        _initialSeekPending: null,
        isLiveStream: () => true
    };

    // 1. Gap jump: playhead parked in a hole between buffered ranges
    PlaybackEngine.startStallMonitor(player, item, 7, 'mse-ts:http://x/live.ts', 'mpegts');
    await new Promise(r => setTimeout(r, 2600));
    assert.ok(Math.abs(video.currentTime - 10.7) < 0.001, 'playhead should jump to next buffered range');
    PlaybackEngine.stopStallMonitor(player);
    assert.equal(player._stallTimer, null);

    // 2. Hls.js engine skips gap handling (GapController owns it)
    video.currentTime = 10.2;
    PlaybackEngine.startStallMonitor(player, item, 7, 'mse-hls:http://x/live.m3u8', 'hls');
    await new Promise(r => setTimeout(r, 2600));
    assert.equal(video.currentTime, 10.2);
    PlaybackEngine.stopStallMonitor(player);

    // 3. Stale session stops the monitor on its own
    PlaybackEngine.startStallMonitor(player, item, 6, 'x', 'mpegts');
    await new Promise(r => setTimeout(r, 700));
    assert.equal(player._stallTimer, null);
});

test('downloadUtils.parseContentRange parses valid ranges and rejects malformed headers', () => {
    const downloadUtils = require(path.join(ROOT, 'windows/downloadUtils.js'));

    assert.deepEqual(downloadUtils.parseContentRange('bytes 1024-2047/4096'), { start: 1024, end: 2047, total: 4096 });
    assert.deepEqual(downloadUtils.parseContentRange('bytes 0-99/*'), { start: 0, end: 99, total: 0 });
    assert.equal(downloadUtils.parseContentRange('invalid'), null);
    assert.equal(downloadUtils.parseContentRange(null), null);
});

test('BrowseView renders .header-category and updates it when category selection changes', () => {
    const contentEl = { className: '', scrollTop: 0, innerHTML: '' };
    const countHeader = { textContent: '' };
    const catHeader = { textContent: '', title: '' };
    let capturedHtml = '';

    const sectionEl = {
        get innerHTML() { return capturedHtml; },
        set innerHTML(val) { capturedHtml = val; },
        querySelector(sel) {
            if (sel === '.browse-content') return contentEl;
            if (sel === '.header-count') return countHeader;
            if (sel === '.header-category') return catHeader;
            return null;
        },
        querySelectorAll: () => []
    };

    const env = createBrowserEnv();
    env.window.document.getElementById = (id) => (id === 'section-live' ? sectionEl : null);
    loadScript(env, 'IPTVPlayer/js/views/browseView.js');
    const { BrowseView } = env.window.IPTV;

    const view = new BrowseView('live', { title: 'Live TV', cardType: 'live', unitName: 'channels', app: {} });
    view._bindControls = () => {};
    view._renderCategories = () => {};
    view._renderGrid = () => {};
    view.items = [{ id: '1', name: 'News 1', category: 'News' }];
    view._byCategory = { News: view.items };

    view.render();
    assert.match(capturedHtml, /<span class="header-category">All<\/span>/);
    assert.equal(catHeader.textContent, 'All');
    assert.equal(catHeader.title, 'All');

    view.selectedCategory = 'News';
    view._refreshContent();
    assert.equal(catHeader.textContent, 'News');
    assert.equal(catHeader.title, 'News');
    assert.equal(countHeader.textContent, '1 channels');
});


