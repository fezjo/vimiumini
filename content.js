(function () {
  let hints = [];
  let inputBuffer = "";
  let isHintMode = false;
  let hintContainer = null;
  let openInNewTabMode = false; // Track if we want to open in new tab

  // Config: Is extension enabled?
  let isEnabled = true;

  const hostname = window.location.hostname;
  function loadSettings() {
    chrome.storage.sync.get(["isDisabledGlobal", "disabledSites"], (data) => {
      const globalOff = data.isDisabledGlobal || false;
      const siteOff = (data.disabledSites || []).includes(hostname);
      isEnabled = !(globalOff || siteOff);
    });
  }
  loadSettings();
  chrome.storage.onChanged.addListener(loadSettings);

  // Optimized Character Set: Home row -> Strong fingers
  const CHARACTERS = "fjdkslaghwrieucmvnqo";

  document.addEventListener("keydown", (e) => {
    if (!isEnabled) return;

    // Ignore typing in input fields unless we are in hint mode
    if (
      !isHintMode &&
      (e.target.tagName === "INPUT" ||
        e.target.tagName === "TEXTAREA" ||
        e.target.isContentEditable)
    ) {
      return;
    }

    // Toggle Hint Mode
    // 'f' = Current Tab, 'F' (Shift+f) = New Tab
    if ((e.key === "f" || e.key === "F") && !isHintMode) {
      if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        openInNewTabMode = e.key === "F"; // Check if Shift was held
        createHints();
        return;
      }
    }

    if (isHintMode) {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        removeHints();
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        handleKeyInput(e.key.toLowerCase());
      } else if (e.key === "Backspace") {
        inputBuffer = inputBuffer.slice(0, -1);
        updateHintVisuals();
      }
    }
  });

  function createHints() {
    isHintMode = true;
    inputBuffer = "";

    // Added 'summary' and explicit tabindex support
    const selectors =
      "a, button, input, textarea, select, summary, [onclick], [role='button'], [tabindex]:not([tabindex='-1'])";

    let elements = Array.from(document.querySelectorAll(selectors)).filter(
      isVisible,
    );

    // --- IMPROVED RANKING ALGORITHM ---
    const viewWidth = window.innerWidth;
    const viewHeight = window.innerHeight;
    const centerX = viewWidth / 2;
    const centerY = viewHeight / 2;

    const scoredElements = elements.map((el) => {
      const rect = el.getBoundingClientRect();
      const elCenterX = rect.left + rect.width / 2;
      const elCenterY = rect.top + rect.height / 2;

      // 1. Distance Score (Closer to center is better)
      const dist = Math.sqrt(
        Math.pow(elCenterX - centerX, 2) + Math.pow(elCenterY - centerY, 2),
      );

      // 2. Area Score (Bigger is better)
      const area = rect.width * rect.height;

      // 3. Semantic/Structural Bonus
      // We check parent tags to see if this is a nav bar or sidebar
      let structureBonus = 0;
      const parentHTML = el.closest(
        'nav, header, aside, footer, [role="navigation"], [role="banner"]',
      );

      if (parentHTML) {
        const tag = parentHTML.tagName.toLowerCase();
        if (tag === "nav" || parentHTML.getAttribute("role") === "navigation")
          structureBonus = 1000;
        else if (tag === "header") structureBonus = 800;
        else if (tag === "aside") structureBonus = 600;
      }

      // Final Calculation
      // We weigh structure heavily so nav bars always get 'good' keys
      const score = structureBonus + area / 1000 - dist / 5;

      return { el, score, rect };
    });

    // Sort descending
    scoredElements.sort((a, b) => b.score - a.score);
    elements = scoredElements.map((item) => item.el);
    // ----------------------------------

    hintContainer = document.createElement("div");
    hintContainer.id = "vimiumini-container";
    // Ensure hints are always on top (max 32-bit int)
    hintContainer.style.zIndex = "2147483647";
    document.body.appendChild(hintContainer);

    hints = elements.map((el, index) => {
      // Use the robust generator
      const hintString = generateHintString(index, elements.length);
      const rect = el.getBoundingClientRect();

      const marker = document.createElement("div");
      marker.className = "vimiumini-hint";
      marker.innerText = hintString.toUpperCase();

      // Color change for "New Tab" mode to warn user
      if (openInNewTabMode) {
        marker.style.backgroundColor = "#ff99cc"; // Pink for new tab
        marker.style.borderColor = "#cc0066";
      }

      marker.style.left = window.scrollX + rect.left + "px";
      marker.style.top = window.scrollY + rect.top + "px";

      hintContainer.appendChild(marker);

      return {
        element: el,
        hintString: hintString,
        marker: marker,
      };
    });
  }

  function removeHints() {
    if (hintContainer) {
      hintContainer.remove();
      hintContainer = null;
    }
    hints = [];
    isHintMode = false;
    inputBuffer = "";
  }

  function handleKeyInput(char) {
    inputBuffer += char;
    const exactMatch = hints.find((h) => h.hintString === inputBuffer);

    if (exactMatch) {
      executeClick(exactMatch.element);
      removeHints();
      return;
    }

    const possibleMatches = hints.filter((h) =>
      h.hintString.startsWith(inputBuffer),
    );
    if (possibleMatches.length === 0) {
      inputBuffer = inputBuffer.slice(0, -1);
    } else {
      updateHintVisuals();
    }
  }

  function executeClick(element) {
    // If it's a "New Tab" request
    if (openInNewTabMode) {
      // We simulate a Meta(Mac) or Ctrl(Win) click
      const clickEvent = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: window,
        ctrlKey: true, // For Windows/Linux
        metaKey: true, // For Mac
      });
      element.dispatchEvent(clickEvent);
    } else {
      // Standard Click
      element.click();
      if (["INPUT", "TEXTAREA"].includes(element.tagName)) {
        element.focus();
      }
    }
  }

  function updateHintVisuals() {
    hints.forEach((h) => {
      if (h.hintString.startsWith(inputBuffer)) {
        h.marker.style.display = "block";
        if (inputBuffer.length > 0) h.marker.classList.add("match");
      } else {
        h.marker.style.display = "none";
      }
    });
  }

  // Generates unique strings of uniform length based on total count.
  // This prevents prefix collisions (e.g. "f" vs "ff") and crashes on high counts.
  function generateHintString(index, totalItems) {
    const base = CHARACTERS.length;
    let power = 1;

    // Determine how many chars are needed to cover all items uniquely
    while (Math.pow(base, power) < totalItems) {
      power++;
    }

    let hint = "";
    let remainder = index;

    for (let i = 0; i < power; i++) {
      hint = CHARACTERS[remainder % base] + hint;
      remainder = Math.floor(remainder / base);
    }
    return hint;
  }

  function isVisible(el) {
    // Performance optimization: Quick check first
    if (!el.offsetParent && el.tagName !== "BODY") {
      // Elements with position:fixed might have null offsetParent but be visible
      // However, standard hidden elements usually fail this check quickly.
      const style = window.getComputedStyle(el);
      if (style.position !== "fixed") return false;
    }

    // Use modern browser API if available (very fast)
    if (el.checkVisibility) {
      return el.checkVisibility({
        checkOpacity: true,
        checkVisibilityCSS: true,
      });
    }

    // Fallback for older browsers
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;

    const style = window.getComputedStyle(el);
    return (
      style.visibility !== "hidden" &&
      style.display !== "none" &&
      style.opacity !== "0"
    );
  }
})();
