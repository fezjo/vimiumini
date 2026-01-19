document.addEventListener('DOMContentLoaded', () => {
    const globalCheck = document.getElementById('globalToggle');
    const siteCheck = document.getElementById('siteToggle');
    let currentHostname = "";

    // Get current tab domain
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        const url = new URL(tabs[0].url);
        currentHostname = url.hostname;

        // Load saved settings
        chrome.storage.sync.get(['isDisabledGlobal', 'disabledSites'], (data) => {
            const disabledSites = data.disabledSites || [];

            globalCheck.checked = !data.isDisabledGlobal;
            siteCheck.checked = !disabledSites.includes(currentHostname);
        });
    });

    // Save Global Setting
    globalCheck.addEventListener('change', () => {
        chrome.storage.sync.set({ isDisabledGlobal: !globalCheck.checked });
    });

    // Save Site Setting
    siteCheck.addEventListener('change', () => {
        chrome.storage.sync.get(['disabledSites'], (data) => {
            let sites = data.disabledSites || [];
            if (!siteCheck.checked) {
                if (!sites.includes(currentHostname)) sites.push(currentHostname);
            } else {
                sites = sites.filter(site => site !== currentHostname);
            }
            chrome.storage.sync.set({ disabledSites: sites });
        });
    });
});
