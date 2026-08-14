// Content script: Loader cho 3DG Topology Checker Extension
// Inject CSS và JavaScript các Module vào MAIN world context của trang 3dg.vn

const scripts = [
    'core/map-bridge.js',
    'core/topo-engine.js',
    'core/area-deleter.js',
    'core/topo-ui.js'
];

// Inject CSS stylesheet
const styleLink = document.createElement('link');
styleLink.rel = 'stylesheet';
styleLink.href = chrome.runtime.getURL('styles.css');
(document.head || document.documentElement).appendChild(styleLink);

function injectNext(index) {
    if (index >= scripts.length) {
        console.log('[TopologyChecker] ✅ Tất cả các Module đã được nạp thành công!');
        return;
    }
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL(scripts[index]);
    script.onload = function () {
        console.log('[TopologyChecker] ✅ Module Loaded:', scripts[index]);
        this.remove();
        injectNext(index + 1);
    };
    script.onerror = function () {
        console.error('[TopologyChecker] ❌ FAILED to load Module:', scripts[index]);
        this.remove();
        injectNext(index + 1);
    };
    (document.head || document.documentElement).appendChild(script);
}

injectNext(0);
