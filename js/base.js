// find template and compile it
var templateSource = document.getElementById('results-template').innerHTML,
  template = Handlebars.compile(templateSource),
  noResultTemplateSource = document.getElementById('no-results-template').innerHTML,
  noResultTemplate = Handlebars.compile(noResultTemplateSource),
  resultsPlaceholder = document.getElementById('results'),
  definiteResult = [];


var fetchTracks = function(albumId, callback) {
  $.ajax({
    url: 'https://api.spotify.com/v1/albums/' + albumId,
    success: function(response) {
      //console.log(response);
      callback(response);
    }
  });
};

var searchAlbums = function(requestObj, callback) {


  $.ajax({
    url: 'https://api.spotify.com/v1/search',
    data: {
      q: "label:\"" + requestObj.label + "\", tag:new",
      type: 'album',
      market: 'DE'
    },
    success: function(response) {
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
        entry.coverimage = record.images[0].url;
        entry.albumType = record.album_type;
        entry.label = requestObj.label;

        (function(record, entry, list, newReleaseFlagDate) {
          fetchTracks(record.id, function(data) {
            entry.artist = data.artists[0].name;
            entry.album = record.name;
            entry.releaseDate = data.release_date;
            entry.newFlag = new Date(entry.releaseDate) >= newReleaseFlagDate;
            entry.genres = data.gernres;
            list.push(entry);
            // Ende rausfinden
            if (records.length == list.length) {
              callback(list);
            }
          })
        })(record, entry, list, newReleaseFlagDate);
      }
    }
  });
};

var openSpotifyURL = function(e) {
  var target = e.target;
  if (target !== null && target.classList.contains('cover')) {
    var url = target.getAttribute('data-album-url');
    document.location = url;
  }
};

results.addEventListener('click', openSpotifyURL);

document.getElementById('search-form').addEventListener('submit', function(e) {
  e.preventDefault();

  var query,
    labelField = document.getElementById('label').value;

  if (labelField) {
    addToLabelList(labelField);
    showLabelList();
  }

  searchLabels();
}, false);


document.getElementById('upload-from-list').addEventListener('click', function(e) {
  $("#file-upload-container").show();
}, false);

document.getElementById('label-file').addEventListener('change', function(e) {
  e.preventDefault();

  var selectedFile = document.getElementById('label-file').files[0];

  var reader = new FileReader();
  reader.onload = function(){
    localStorage.clear();

    var lines = reader.result.split('\n');

    for (key in lines) {
      var entry = lines[key];
      addToLabelList(entry);
    }

    showLabelList();
    searchLabels();
  };
  reader.readAsText(selectedFile);

  $("#file-upload-container").hide();

}, false);


document.getElementById('find-records').addEventListener('click', function(e) {
  e.preventDefault();
  searchLabels();
}, false);

var searchLabels = function() {
  document.getElementById('results').innerHTML = "";
  definiteResult = [];

  var
    lastSearches = getLabelsFromStorage(),
    totalSize = Object.keys(lastSearches).length,
    count = 0;

  if (totalSize > 0) {
    for (key in lastSearches) {
      var entry = lastSearches[key];
      count++;
      (function(entry, totalSize) {
        searchAlbums(entry, function(data) {
          if (data.length > 0) {
            definiteResult = definiteResult.concat(data);
          }
          if (count == totalSize) {
            definiteResult.sort(function(a, b) {
              if (a.releaseDate > b.releaseDate) {
                return -1;
              }
              if (a.releaseDate < b.releaseDate) {
                return 1;
              }
              // a must be equal to b
              return 0;
            });
            document.getElementById('results').innerHTML = template(definiteResult);
          }
        });
      })(entry, totalSize);
    }
  }

}

var addToLabelList = function(label) {
  var currentLabels = getLabelsFromStorage(),
    labelObj = {
      "label": label
    },
    labelKey = encodeURI(label);

  currentLabels[labelKey] = labelObj;
  setLabelsToStorage(currentLabels);
}

var showLabelList = function() {
  var $labelsContainer = $("#labels-container"),
    $labelsList = $("#last-searches");
  $labelsList.empty();

  var lastSearches = getLabelsFromStorage();

  if (!$.isEmptyObject(lastSearches)) {
    $labelsContainer.show();

    for (key in lastSearches) {
      var entry = lastSearches[key];

      $('<li/>', {
          'data-label': entry.label
        }) //
        .append("<span>" + entry.label + "</span>") //
        .addClass("last-search-entry") //
        .appendTo($labelsList) //
        .click(function() {
          var $element = $(this);
          removeLabel($element.data("label"));
          showLabelList();
        });
    }
  } else {
    $labelsContainer.hide();
  }
}

var removeLabel = function(labelToDelete) {
  var newList = {},
    oldList = getLabelsFromStorage();

  if (!$.isEmptyObject(oldList)) {
    for (key in oldList) {
      var entry = oldList[key];
      if (labelToDelete !== entry.label) {
        newList[key] = entry;
      }
    }
  }
  setLabelsToStorage(newList);

  searchLabels();
}

var getLabelsFromStorage = function() {
  return JSON.parse(localStorage.getItem('labelList')) || {};
}

var setLabelsToStorage = function(currentLabels) {
  localStorage.setItem("labelList", JSON.stringify(currentLabels));
}

var clearHistory = function() {
  localStorage.clear();
  showLabelList();
}

$(document).ready(function() {
  $("#label").focus();
  $("#clear-history").click(clearHistory);
  showLabelList();
  searchLabels();
});
