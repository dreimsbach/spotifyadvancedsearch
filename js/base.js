// find template and compile it
var templateSource = document.getElementById('results-template').innerHTML,
    template = Handlebars.compile(templateSource),
    noResultTemplateSource = document.getElementById('no-results-template').innerHTML,
    noResultTemplate = Handlebars.compile(noResultTemplateSource),
    resultsPlaceholder = document.getElementById('results'),
    playingCssClass = 'playing',
    audioObject = null;

var fetchTracks = function (albumId, callback) {
    $.ajax({
        url: 'https://api.spotify.com/v1/albums/' + albumId,
        success: function (response) {
            //console.log(response);
            callback(response);
        }
    });
};

var pauseAudio = function () {
    if (audioObject) {
        audioObject.pause();
    }
};

var searchAlbums = function (query, callback) {
    $.ajax({
        url: 'https://api.spotify.com/v1/search',
        data: {
            q: query,
            type: 'album',
            market: 'DE'
        },
        success: function (response) {
            //console.log(response);
            var list = [],
                newReleaseFlagDate = new Date(),
              records = response.albums.items;


            if (response.albums.items.length == 0) {
                callback(list);
            }
            // New Releases = within two weeks
            newReleaseFlagDate.setDate(newReleaseFlagDate.getDate() - 14);

            for (item in records) {
                var record = records[item],
                  entry = {};

                entry.uri = record.uri;
                entry.id = record.id;
                entry.converimage = record.images[0].url;
                entry.albumType = record.album_type;

                (function(record, entry, list, newReleaseFlagDate){
                    fetchTracks(record.id, function(data) {
                        entry.artist = data.artists[0].name;
                        entry.album = record.name;
                        entry.releaseDate = data.release_date;
                        entry.newFlag = new Date(entry.releaseDate) >= newReleaseFlagDate;
                        entry.genres = data.gernres;
                        list.push(entry);
                        // Ende rausfinden
                        if (records.length == list.length) {
                            list.sort(function (a, b) {
                              if (a.releaseDate > b.releaseDate) {
                                return -1;
                              }
                              if (a.releaseDate < b.releaseDate) {
                                return 1;
                              }
                              // a must be equal to b
                              return 0;
                            });
                            callback(list);
                      }
                    })
                })(record, entry, list, newReleaseFlagDate);
            }
        }
    });
};

var audioPlayerInit =  function (e) {
    var target = e.target;
    if (target !== null && target.classList.contains('cover')) {
        if (target.classList.contains(playingCssClass)) {
            pauseAudio();
        } else {
            pauseAudio();
            fetchTracks(target.getAttribute('data-album-id'), function (data) {
                audioObject = new Audio(data.tracks.items[0].preview_url);
                audioObject.play();
                target.classList.add(playingCssClass);
                audioObject.addEventListener('ended', function () {
                    target.classList.remove(playingCssClass);
                });
                audioObject.addEventListener('pause', function () {
                    target.classList.remove(playingCssClass);
                });
            });
        }
    }
};

var openSpotifyURL =  function (e) {
    var target = e.target;
    if (target !== null && target.classList.contains('cover')) {
        var url = target.getAttribute('data-album-url');
        document.location = url;
    }
};

results.addEventListener('click', audioPlayerInit);
results.addEventListener('touchstart', openSpotifyURL);


window.addEventListener("keypress", function(e) {
  if (e.keyCode === 0 || e.keyCode === 32) {
    //e.preventDefault();
  pauseAudio();
  }
});

window.addEventListener('focus', function() {
  pauseAudio();
});

window.addEventListener('blur', function() {
  pauseAudio();
});

document.getElementById('search-form').addEventListener('submit', function (e) {
    e.preventDefault();

    var query,
      artist,
        year,
        label,
      artistField = document.getElementById('artist').value,
        yearField = document.getElementById('year').value,
        labelField = document.getElementById('label').value;

    if (artistField) {
        artist = "artist:\""  + artistField + "\"";
    }

    if (yearField) {
        if ("new" === yearField) {
            year = "tag:new";
        } else {
          year = "year:"  + yearField ;
        }
    }

    if (labelField) {
        label = "label:\""  + labelField + "\"";
    }



    query = $.grep([artist, label, year], Boolean).join(", ");

    searchAlbums(query, function(data) {
        if (data.length > 0) {
            resultsPlaceholder.innerHTML = template(data);
            addToSearchHistory(labelField, yearField, artistField);
        } else {
            resultsPlaceholder.innerHTML = noResultTemplate(data);
        }
        showLastSearches();
    });


}, false);

var addToSearchHistory = function (label, year, artist) {
    var lastSearches = JSON.parse(localStorage.getItem('lastSearchArray')) || {},
      lastSearchObj = {
            "label": label,
            "year": year,
            "artist": artist
        },
        lastSearchKey = encodeURI(label+year+artist);


    lastSearches[lastSearchKey] =  lastSearchObj;
    localStorage.setItem("lastSearchArray", JSON.stringify(lastSearches));
}

var showLastSearches = function () {
    var $lastSearchesContainer = $("#lastSearchesContainer"),
      $lastSearchesList = $("#lastSearches");
    $lastSearchesList.empty();

    var lastSearches = JSON.parse(localStorage.getItem('lastSearchArray')) || {};

    if (!$.isEmptyObject(lastSearches)) {
        $lastSearchesContainer.show();

        for (key in lastSearches) {
            var entry = lastSearches[key];

            $('<li/>', {
                'data-label': entry.label,
                'data-year': entry.year,
                'data-artist': entry.artist
            }) //
            .append("<span>Label:  "+ entry.label +"</span>") //
            .append("<span>Year:  "+ entry.year +"</span>") //
            .append("<span>Artist:  "+ entry.artist +"</span>") //
            .addClass("last-search-entry") //
            .appendTo($lastSearchesList) //
            .click(function() {
                var $element = $(this);
                $("#label").val($element.data("label"));
                $("#year").val($element.data("year"));
                $("#artist").val($element.data("artist"));
                $("#search").click();
            });
      }
    } else {
        $lastSearchesContainer.hide();
    }
}

var clearHistory = function () {
    localStorage.clear();
    showLastSearches();
}

$(document).ready(function() {
    $("#label").focus();
    $("#clearHistory").click(clearHistory);
    showLastSearches();
});
