// find template and compile it
var
  templateSource = document.getElementById('results-template').innerHTML,
  template = Handlebars.compile(templateSource),
  noResultTemplateSource = document.getElementById('no-results-template').innerHTML,
  noResultTemplate = Handlebars.compile(noResultTemplateSource),
  resultsPlaceholder = document.getElementById('results'),
  definiteResult = [];

var fetchTracks = function(albumId, callback) {
  $.ajax({
    url: 'https://api.spotify.com/v1/albums/' + albumId,
    headers: {
      'Authorization': 'Bearer ' + AUTH.getAccessToken()
    },
    success: function(response) {
      callback(response);
    }
  });
};

var searchAlbums = function(requestObj, callback) {
  $.ajax({
    url: 'https://api.spotify.com/v1/search',
    headers: {
      'Authorization': 'Bearer ' + AUTH.getAccessToken()
    },
    data: {
      q: "label:\"" + requestObj.label + "\", tag:new",
      type: 'album',
      market: 'DE'
    },
    success: function(response) {
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
            entry.newFlag = new Date(entry.releaseDate) >=
              newReleaseFlagDate;
            entry.genres = data.gernres;
            list.push(entry);
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
              return 0;
            });
            document.getElementById('results').innerHTML = template(
              definiteResult);
          }
        });
      })(entry, totalSize);
    }
  }

}

var addToLabelList = function(label) {
  if (label && !label.startsWith("#")) {
    var currentLabels = getLabelsFromStorage(),
      labelObj = {
        "label": label
      },
      labelKey = encodeURI(label);

    currentLabels[labelKey] = labelObj;
    setLabelsToStorage(currentLabels);
  }
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
  localStorage.clear();

  var lines = data.split('\n');
  for (key in lines) {
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
    document.getElementById('results').innerHTML = template(
      data);
  });
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

// INIT
$(document).ready(init);
results.addEventListener('click',
  openSpotifyURL);
