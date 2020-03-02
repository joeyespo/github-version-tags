/* global compareVersions */

(function () {
  function throws(f) {
    try {
      f();
    } catch (ex) {
      return true;
    }
    return false;
  }

  function addScript(code) {
    const newScript = document.createElement('script');
    newScript.innerHTML = code;
    document.head.appendChild(newScript);
  }

  function request(method, url, cb) {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.onreadystatechange = function () {
      if (this.readyState === 4) {
        cb({
          text: xhr.responseText,
          json: () => JSON.parse(xhr.responseText),
          status: xhr.status,
          xhr
        });
      }
    };
    xhr.send();
  }

  function insertVersionTag(parent, after, version, title, muted) {
    const versionElement = document.createElement('span');
    versionElement.innerText = version;
    if (title) {
      versionElement.setAttribute('title', title);
    }
    if (muted) {
      versionElement.setAttribute('style', 'font-weight:normal;color:#8a5934;background-color:rgba(251,202,4,0.2);');
    }
    versionElement.classList.add('Counter');
    versionElement.classList.add('GitHub-Version-Tags--Tag');
    parent.insertBefore(document.createTextNode(' '), parent.insertBefore(versionElement, after.nextSibling));
  }

  let requested = false;
  let latest = null;
  let prerelease = null;
  let title = null;

  function getVersionTags(cb) {
    // Only look on pages that include both an author and repo name in the URL
    if (window.location.pathname.split('/').length < 3) {
      return cb();
    }
    const authorElements = document.querySelectorAll('[itemprop="author"]');
    const nameElements = document.querySelectorAll('[itemprop="name"]');
    const author = authorElements.length > 0 ? authorElements[0].innerText : '';
    const name = nameElements.length > 0 ? nameElements[0].innerText : '';
    if (!author || !name) {
      console.debug('No GitHub author/name itemprop elements found.');
      return cb();
    }
    // Request tags from the GitHub API
    request('GET', 'https://api.github.com/repos/' + author + '/' + name + '/tags', r => {
      let data;
      if (r.status === 404) {
        // Fall back to tag list for private repos
        // Note: The API took precedence for robustness (to avoid scraping and since this tag list dropdown isn't on every page)
        const tagList = document.querySelectorAll('.select-menu-list[data-tab-filter="tags"]')[0];
        if (!tagList) {
          return cb();
        }
        data = [...tagList.querySelectorAll('.select-menu-item')].map(x => x.getAttribute('data-name'));
      } else {
        data = r.json().map(x => x.name);
      }
      requested = true;
      const versions = data
        .map(x => x[0] === 'v' ? x.substr(1) : x)
        .filter(x => !throws(() => compareVersions('0', x)))
        .sort((a, b) => compareVersions(b, a));
      if (versions.length === 0) {
        return cb();
      }
      latest = versions.filter(x => !x.includes('-'))[0];
      prerelease = versions.filter(x => x.includes('-'))[0];
      if (latest && prerelease && compareVersions(prerelease, latest) === -1) {
        prerelease = null;
      }
      title = [
        ...(latest ? ['Latest version: ' + latest] : []),
        ...(prerelease ? ['Pre-release: ' + prerelease] : []),
        ...(versions.length > 0 ? ['All tagged versions (' + versions.length + '): ' + versions.join(', ')] : []),
      ].join('\n\n');
      return cb();
    });
  }

  function addVersionTags() {
    // Look for tags on each navigation until they can be found
    if (!requested) {
      return getVersionTags(() => {
        // Try again if found
        if (requested) {
          addVersionTags();
        }
      });
    }
    // Find repo name and insert version tags after
    const repoElement = document.querySelectorAll('.repohead div div h1')[0];
    if (repoElement.querySelectorAll('.GitHub-Version-Tags--Tag').length > 0) {
      return;
    }
    const nameElement = repoElement.querySelectorAll('[itemprop="name"]')[0];
    if (!latest && !prerelease) {
      insertVersionTag(repoElement, nameElement, 'no versions tagged');
    }
    // Note: These are inserted right after the repo name, so insert in reverse order
    if (prerelease) {
      insertVersionTag(repoElement, nameElement, prerelease, title, true);
    }
    if (latest) {
      insertVersionTag(repoElement, nameElement, latest, title);
    }
  }

  // Add 'xhrRequested' and 'xhrResponded' events
  addScript(`
    (function () {
      function sendEvent(name, arg) { const e = new Event(name); e.arguments = arg; window.dispatchEvent(e); }
      const proxied = window.XMLHttpRequest.prototype.send;
      window.XMLHttpRequest.prototype.send = function () {
        sendEvent('xhrRequested', this);
        const intervalId = window.setInterval(() => {
          if (this.readyState === 4) {
            sendEvent('xhrResponded', this);
            clearInterval(intervalId);
          }
        }, 100);
        return proxied.apply(this, [].slice.call(arguments));
      };
    })();`);

  // Request tags and update on soft transition
  addVersionTags();
  window.addEventListener('xhrResponded', () => addVersionTags(), false);
})();
