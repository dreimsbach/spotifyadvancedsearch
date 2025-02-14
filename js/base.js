// Wait for both jQuery and Handlebars to be available
function waitForHandlebars(callback, maxAttempts = 50) {
  if (typeof Handlebars !== 'undefined') {
    callback();
  } else if (maxAttempts > 0) {
    setTimeout(() => waitForHandlebars(callback, maxAttempts - 1), 100);
  } else {
    console.error('Handlebars failed to load');
  }
}

// Rate limiting and retry queue
const requestQueue = {
  queue: new Map(),
  processing: false,
  lastRequest: 0,
  minDelay: 25,
  maxRetries: 3,
  baseDelay: 250,
  loadingIndicator: null,

  showLoading() {
    if (!this.loadingIndicator) {
      this.loadingIndicator = document.getElementById('loading-indicator');
    }
    this.loadingIndicator.classList.remove('hidden');
  },

  hideLoading() {
    if (!this.loadingIndicator) {
      this.loadingIndicator = document.getElementById('loading-indicator');
    }
    if (this.queue.size === 0) {
      this.loadingIndicator.classList.add('hidden');
    }
  },

  async add(key, fn, onSuccess) {
    if (this.queue.has(key)) {
      return; // Already queued
    }

    this.queue.set(key, {
      fn,
      onSuccess,
      retries: 0,
      nextTry: Date.now()
    });

    this.showLoading();

    if (!this.processing) {
      this.process();
    }
  },

  async process() {
    if (this.processing || this.queue.size === 0) return;
    this.processing = true;

    while (this.queue.size > 0) {
      const now = Date.now();
      let nextItem = null;
      let nextKey = null;

      // Find next item to process
      for (const [key, item] of this.queue) {
        if (item.nextTry <= now) {
          nextItem = item;
          nextKey = key;
          break;
        }
      }

      if (!nextItem) {
        // All items are waiting for retry
        const minWait = Math.min(...Array.from(this.queue.values()).map(i => i.nextTry - now));
        await new Promise(resolve => setTimeout(resolve, minWait));
        continue;
      }

      // Respect rate limiting
      const timeToWait = Math.max(0, this.lastRequest + this.minDelay - now);
      if (timeToWait > 0) {
        await new Promise(resolve => setTimeout(resolve, timeToWait));
      }

      try {
        const result = await nextItem.fn();
        this.queue.delete(nextKey);
        this.lastRequest = Date.now();
        nextItem.onSuccess(result);
      } catch (error) {
        if (error.status === 429 && nextItem.retries < this.maxRetries) {
          const retryAfter = error.getResponseHeader?.('Retry-After') || 1;
          const delay = Math.max(
            this.baseDelay * Math.pow(2, nextItem.retries),
            retryAfter * 1000
          );
          nextItem.retries++;
          nextItem.nextTry = Date.now() + delay;
          console.log(`Rate limited for ${nextKey}. Retry ${nextItem.retries} scheduled in ${delay}ms`);
        } else {
          this.queue.delete(nextKey);
          console.error(`Failed to process ${nextKey} after ${nextItem.retries} retries:`, error);
        }
      }

      this.hideLoading();
    }

    this.processing = false;
  }
};

// Initialize after libraries are loaded
$(function() {
  waitForHandlebars(function() {
    // find template and compile it
    var
      templateSource = document.getElementById('results-template').innerHTML,
      template = Handlebars.compile(templateSource),
      noResultTemplateSource = document.getElementById('no-results-template').innerHTML,
      noResultTemplate = Handlebars.compile(noResultTemplateSource),
      resultsPlaceholder = document.getElementById('results'),
      definiteResult = [];

    // Register Handlebars helpers
    Handlebars.registerHelper('capitalize', function(str) {
      if (typeof str !== 'string') return '';
      return str.charAt(0).toUpperCase() + str.slice(1);
    });

    var fetchAlbums = function(albumIds, callback) {
      const key = `albums-${albumIds}`;
      requestQueue.add(
        key,
        () => $.ajax({
          url: 'https://api.spotify.com/v1/albums/',
          data: {ids : albumIds},
          headers: {
            'Authorization': 'Bearer ' + AUTH.getAccessToken()
          }
        }),
        callback
      );
    };

    var searchAlbums = function(requestObj, callback, year, toggle) {
      var yearAppendix = "tag:new";
      if (year) {
        yearAppendix = "year:" + year;
      }

      const key = `search-${requestObj.label}-${yearAppendix}`;
      requestQueue.add(
        key,
        () => $.ajax({
          url: 'https://api.spotify.com/v1/search',
          headers: {
            'Authorization': 'Bearer ' + AUTH.getAccessToken()
          },
          data: {
            q: "label:\"" + requestObj.label + "\" " + yearAppendix,
            type: 'album',
            market: 'DE'
          }
        }),
        (response) => {
          var list = [],
            newReleaseFlagDate = new Date(),
            records = response.albums.items;

          if (response.albums.items.length === 0) {
            callback(list);
            return false;
          }

          if (toggle) {
            toggleSearchResult();
          }

          // New Releases = within two weeks
          newReleaseFlagDate.setDate(newReleaseFlagDate.getDate() - 14);

          var albumIds = "";
          Object.keys(records).forEach(function(key) {
            var record = records[key];
            if (albumIds !== "") {
              albumIds += ",";
            }
            albumIds += record.id;
          });

          fetchAlbums(albumIds, function(data) {
            var control = 0;
            Object.keys(data).forEach(function(key) {
              var albums = data[key];
              Object.keys(albums).forEach(async function(albumKey) {
                var album = albums[albumKey],
                    entry = {
                      uri: album.uri,
                      id: album.id,
                      coverimage: album.images[0].url,
                      album_type: album.album_type,
                      total_tracks: album.tracks.total,
                      label: album.label,
                      artist: album.artists[0].name,
                      album: album.name,
                      releaseDate: album.release_date,
                      newFlag: new Date(album.release_date) >= newReleaseFlagDate,
                      genres: album.genres,
                      tracks: {
                        total: album.tracks.total
                      },
                      artists: album.artists,
                      images: album.images,
                      external_urls: album.external_urls
                    };

                // Fetch Apple Music URL
                async function getAppleMusicUrl(artist, album) {
                  const searchTerm = `${artist} ${album}`.replace(/[^\w\s]/g, '');
                  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(searchTerm)}&entity=album&limit=1`;
                  
                  try {
                    const response = await fetch(url);
                    const data = await response.json();
                    if (data.results && data.results.length > 0) {
                      return data.results[0].collectionViewUrl;
                    }
                  } catch (error) {
                    console.error('Error fetching Apple Music URL:', error);
                  }
                  return null;
                }

                // Get Apple Music URL
                const appleMusicUrl = await getAppleMusicUrl(entry.artist, entry.album);
                if (appleMusicUrl) {
                  entry.appleMusicUrl = appleMusicUrl;
                }

                // skip preview singles
                if (album.tracks.total > 1) {
                  list.push(entry);
                }

                control++;
                if (records.length === control) {
                 callback(list);
                }
              });
            });
          });
        }
      );
    };

    var openSpotifyURL = function(e) {
      var target = e.target;
      if (target !== null && target.classList.contains('cover')) {
        var url = target.getAttribute('data-album-url');
        document.location = url;
      }
    };

    var searchLabels = function() {
      document.getElementById('results').innerHTML = "";
      definiteResult = [];

      var
        lastSearches = getLabelsFromStorage(),
        totalSize = Object.keys(lastSearches).length,
        count = 0;

      if (totalSize > 0) {
        toggleSearchResult();

        Object.keys(lastSearches).forEach(function(key) {
          var entry = lastSearches[key];
          count++;
          (function(entry, totalSize) {
            searchAlbums(entry, function(data) {
              if (data.length > 0) {
                definiteResult = definiteResult.concat(data);
              }
              if (count === totalSize) {
                definiteResult.sort(function(a, b) {
                  if (a.releaseDate > b.releaseDate) {
                    return -1;
                  }
                  if (a.releaseDate < b.releaseDate) {
                    return 1;
                  }
                  return 0;
                });
                document.getElementById('results').innerHTML = template(definiteResult);
              }
            });
          })(entry, totalSize);
        });
      }
    };

    var addToLabelList = function(label) {
      if (label && !label.startsWith("#")) {
        var currentLabels = getLabelsFromStorage(),
          labelObj = {
            "label": label
          },
          labelKey = label;

        currentLabels[labelKey] = labelObj;
        setLabelsToStorage(currentLabels);
      }
    };

    var showLabelList = function() {
      var $labelsContainer = $("#labels-container"),
        $labelsList = $("#last-searches");
      $labelsList.empty();

      var lastSearches = getLabelsFromStorage();

      if (!$.isEmptyObject(lastSearches)) {
        $labelsContainer.show();

        Object.keys(lastSearches).forEach(function(key) {
          var entry = lastSearches[key];
          $('<li/>')
            .attr('data-label', entry.label)
            .append($("<span>").text(entry.label))
            .addClass("last-search-entry")
            .appendTo($labelsList)
            .on('click', function() {
              var $element = $(this);
              removeLabel($element.data("label"));
              showLabelList();
            });
        });
      } else {
        $labelsContainer.hide();
      }
    };

    var removeLabel = function(labelToDelete) {
      var newList = {},
        oldList = getLabelsFromStorage();

      if (!$.isEmptyObject(oldList)) {
        Object.keys(oldList).forEach(function(key) {
          var entry = oldList[key];
          if (entry.label !== labelToDelete) {
            newList[key] = entry;
          }
        });
        setLabelsToStorage(newList);
      }
      searchLabels();
    };

    var getLabelsFromStorage = function() {
      return JSON.parse(localStorage.getItem('labelList')) || {};
    }

    var setLabelsToStorage = function(currentLabels) {
      localStorage.setItem("labelList", JSON.stringify(currentLabels));
    }

    var clearHistory = function() {
      localStorage.removeItem("labelList");
      showLabelList();
    }

    var submitSearchForm = function(e) {
      e.preventDefault();

      var labelField = document.getElementById('label').value;
      if (labelField) {
        addToLabelList(labelField);
        showLabelList();
      }

      searchLabels();
    }

    var useDataFromFile = function(data) {
      localStorage.removeItem("labelList");

      var lines = data.split('\n');
      for (var key in lines) {
        var entry = lines[key];
        addToLabelList(entry);
      }

      showLabelList();
      searchLabels();
    }

    var changeOrUploadFile = function(e) {
      e.preventDefault();

      var
        selectedFile = document.getElementById('label-file').files[0],
        reader = new FileReader();

      reader.onload = function() {
        useDataFromFile(reader.result);
      };
      reader.readAsText(selectedFile);

      $("#file-upload-container").hide();
    }

    var readFromURL = function(e) {
      e.preventDefault();
      $.ajax({
        url: $('#label-url-list').val(),
        success: useDataFromFile
      });
      $("#url-upload-container").hide();
    }

    var searchDirectLabel = function(e) {
      e.preventDefault();

      var label = document.getElementById('label').value;
      if (!label) {
        return false;
      }

      searchAlbums({
        "label": label
      }, function(data) {
        presentResult(data);
      }, document.getElementById('year').value, true);
    }

    var presentResult = function(data) {
      document.getElementById('results').innerHTML = template(
        data);
      if(data && data.length == 0) {
        alert("Nothing found");
      }
    }

    var toggleSearchResult = function() {
      $("#controls").toggle(100);
      $("#toggle").toggle();
    }

    var initLogin = function() {
      if (AUTH.isLoggedin()) {
        //searchLabels();
      } else {
        $("#logged-in-content-container").hide();
        $("#login-button-container").show();
        $("#btn-login").click(function() {
          AUTH.login(function() {
            $("#login-button-container").hide();
            $("#logged-in-content-container").show();
            //searchLabels();
          })
        });
      }
    }

    var init = function() {
      $("#label").focus();
      $("#clear-history").on("click", clearHistory);
      $("#find-records").on("click", searchLabels);
      $("#add-to-list-btn").on("click", submitSearchForm);
      $("#search-form").on("submit", searchDirectLabel);
      $("#label-file").on("change", changeOrUploadFile);
      $("#url-update-form").on("submit", readFromURL);
      $("#toggle").on("click", toggleSearchResult);

      $("#upload-from-list-btn").on("click", function() {
        $("#url-upload-container").hide();
        $("#file-upload-container").show();
      });

      $("#upload-from-url-btn").on("click", function() {
        $("#file-upload-container").hide();
        $("#url-upload-container").show();
      });
      showLabelList();
      initLogin();

    }

    init();
    results.addEventListener('click', openSpotifyURL);
  });
});
