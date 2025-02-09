let map;
let markers;

let geocoder;

let queryCenter;
let queryZoom;

//When the user clicks on a marker, it will become
// the selected one:
var selectedMarker = null;
let selectedMarkerPopup, Popup;

var DEFAULT_ICON = {
  url: "http://maps.google.com/mapfiles/kml/paddle/grn-blank.png",
};

var SELECTED_ICON = {
  url: "http://maps.google.com/mapfiles/kml/paddle/grn-stars.png",
};

function initMap() {
  console.log("InitMap");

  geocoder = new google.maps.Geocoder();

  map = new google.maps.Map(document.getElementById("map"), {
    center: { lat: 52.52, lng: 13.405 }, //We start at the center of Berlin
    zoom: 11,
    minZoom: 6,
    maxZoom: 19,
    // disabling some controls. Reference: https://developers.google.com/maps/documentation/javascript/controls
    streetViewControl: false,
    fullscreenControl: false,
    mapTypeControl: false,
    mapTypeId: google.maps.MapTypeId.ROADMAP,
  });

  google.maps.event.addListener(map, "idle", function () {
    var newZoom = map.getZoom();
    var newCenter = map.getCenter();

    console.log(
      "Map  event triggers, zoom:" + newZoom + ", center: " + newCenter
    );

    // We want to avoid re-rendering the markers if the change
    // in position within the map is too small. Also, if we are zooming in
    // without changing the center significantly, there is also no need
    // to call the backend again for new points
    var distanceChange =
      queryCenter == null
        ? 0
        : google.maps.geometry.spherical.computeDistanceBetween(
            queryCenter,
            newCenter
          );

    if (
      queryCenter == null ||
      queryZoom == null ||
      distanceChange > 100 ||
      newZoom < queryZoom
    ) {
      //if we have not queried for markers yet, query
      refreshMarkers(newCenter, newZoom);
    }
  });

  /**
   * A customized popup on the map.
   */
  Popup = class Popup extends google.maps.OverlayView {
    position;
    containerDiv;
    constructor(position, contentText) {
      super();
      this.position = position;

      // This zero-height div is positioned at the bottom of the bubble.
      const bubbleAnchor = document.createElement("div");
      const content = document.createElement("div");
      content.classList.add("popup-bubble");
      content.innerHTML = contentText;

      bubbleAnchor.classList.add("popup-bubble-anchor");
      bubbleAnchor.appendChild(content);
      // This zero-height div is positioned at the bottom of the tip.
      this.containerDiv = document.createElement("div");
      this.containerDiv.classList.add("popup-container");
      this.containerDiv.appendChild(bubbleAnchor);
      // Optionally stop clicks, etc., from bubbling up to the map.
      Popup.preventMapHitsAndGesturesFrom(this.containerDiv);
    }
    /** Called when the popup is added to the map. */
    onAdd() {
      this.getPanes().floatPane.appendChild(this.containerDiv);
    }
    /** Called when the popup is removed from the map. */
    onRemove() {
      if (this.containerDiv.parentElement) {
        this.containerDiv.parentElement.removeChild(this.containerDiv);
      }
    }
    /** Called each frame when the popup needs to draw itself. */
    draw() {
      const divPosition = this.getProjection().fromLatLngToDivPixel(
        this.position
      );
      // Hide the popup when it is far out of view.
      const display =
        Math.abs(divPosition.x) < 4000 && Math.abs(divPosition.y) < 4000
          ? "block"
          : "none";

      if (display === "block") {
        this.containerDiv.style.left = divPosition.x + "px";
        this.containerDiv.style.top = divPosition.y + "px";
      }

      if (this.containerDiv.style.display !== display) {
        this.containerDiv.style.display = display;
      }
    }
  };
}

var radiusToZoomLevel = [
  800000, // zoom: 0
  800000, // zoom: 1
  800000, // zoom: 2
  800000, // zoom: 3
  800000, // zoom: 4
  800000, // zoom: 5
  800000, // zoom: 6
  400000, // zoom: 7
  200000, // zoom: 8
  100000, // zoom: 9
  51000, // zoom: 10
  26000, // zoom: 11
  13000, // zoom: 12
  6500, // zoom: 13
  3500, // zoom: 14
  1800, // zoom: 15
  900, // zoom: 16
  430, // zoom: 17
  210, // zoom: 18
  120, // zoom: 19
];

function refreshMarkers(mapCenter, zoomLevel) {
  console.log("refreshing markers");
  //Update query cener and zoom so we know in referenec to what
  //we queried for markers the last time and can decide if a re-query is needed
  queryCenter = mapCenter;
  queryZoom = zoomLevel;

  // If we had already some markers in the map, we need to clear them
  clearMarkers();

  // This will helpt to understand the radius, its for debug only
  //createCircle(mapCenter,radiusToZoomLevel[zoomLevel]);

  // we call the backend to get the list of markers
  var params = {
    lat: mapCenter.lat(),
    lng: mapCenter.lng(),
    radius: radiusToZoomLevel[zoomLevel],
  };
  var url = "/api/get_items_in_radius?" + dictToURI(params);
  loadJSON(url, function (response) {
    // Parse JSON string into object
    var response_JSON = JSON.parse(response);
    console.log(response_JSON);

    if (!response_JSON.success) {
      // something failed in the backed serching for the items
      console.log("/api/get_items_in_radius call FAILED!");
      return;
    }

    // place new markers in the map
    placeItemsInMap(response_JSON.results);
  });
}

function placeItemsInMap(items) {
  // Add some markers to the map.
  // Note: The code uses the JavaScript Array.prototype.map() method to
  // create an array of markers based on the given "items" array.
  // The map() method here has nothing to do with the Google Maps API.
  markers = items.map(function (item, i) {
    var marker = new google.maps.Marker({
      map: map,
      position: item.location,
    });

    marker.setIcon(DEFAULT_ICON);

    //we attach the item to the marker, so when the marker is selected
    //we can get all the item data to fill the highlighted profile box under
    // the map
    marker.profile = item;

    google.maps.event.addListener(marker, "click", function (evt) {
      markerClick(this);
    });

    return marker;
  });

  /*console.log(markers);
    console.log(markers.length);*/
}

function clearMarkers() {
  if (markers) {
    markers.map(function (marker, i) {
      marker.setMap(null);
    });
  }

  markers = new Array();
  selectedMarker = null;
}

// this is maps functionality when user searchs a specific area for results

function searchAddressSubmit() {
  console.log("searchAddressSubmit");

  const address = document.getElementById("search_address").value;
  geocoder.geocode({ address: address }, (results, status) => {
    if (status === "OK") {
      // If you want to provide feedback to the user on the map page:
      //document.getElementById('addressHelpBlock').innerHTML="Perfect! Here are the results near you:";
      map.setZoom(15);
      map.setCenter(results[0].geometry.location);
    } else {
      console.log(
        "Geocode was not successful for the following reason: " + status
      );
      // If you want to provide feedback to the user on the map page:
      //document.getElementById('addressHelpBlock').innerHTML="Sorry! That search did not work, try again!";
    }
  });

  //prevent refresh
  return false;
}

function markerClick(marker) {
  console.log("Marker clicked");
  console.log(marker);

  // de-select the previously active marker, if present
  if (selectedMarker) selectedMarker.setIcon(DEFAULT_ICON);
  marker.setIcon(SELECTED_ICON);

  // remove the popup for the previously selected marker
  if (selectedMarkerPopup) {
    selectedMarkerPopup.setMap(null);
  }

  // update selected marker reference
  selectedMarker = marker;

  // Show popup for the clicked marker
  selectedMarkerPopup = new Popup(
    selectedMarker.position,
    "<a href='/profile?id= " +
      selectedMarker.profile.id +
      "' style='text-decoration: none; font-weight:bold; color:#04fdaeed;'>" +
      selectedMarker.profile.username +
      "🤸‍♀️</a>" +
      "<p>" +
      selectedMarker.profile.level +
      "</p>"
  );
  selectedMarkerPopup.setMap(map);
}
//////////////////////////////////////////////

// this is just for debugging purposes!
// To be able to better understand if the radius in which I search for
// teachers is well adjussted to the level of zoom of the map,
// I add this function to draw a circle showing the radius
function createCircle(latLng, radius) {
  options = getDefaultDrawingOptions();

  options["map"] = map;
  options["center"] = latLng;
  options["radius"] = radius;

  var circle = new google.maps.Circle(options);
  circle.drawing_type = "circle";
}

function getDefaultDrawingOptions() {
  options = new Array();
  options["strokeColor"] = "#000000";
  options["strokeOpacity"] = 0.8;
  options["strokeWeight"] = 2;
  options["fillOpacity"] = 0;
  options["geodesic"] = false;
  options["editable"] = false;
  options["draggable"] = false;

  return options;
}

function loadJSON(url, callback) {
  var xobj = new XMLHttpRequest();

  xobj.overrideMimeType("application/json");
  xobj.open("GET", url, true);
  xobj.onreadystatechange = function () {
    if (xobj.readyState == 4 && xobj.status == "200") {
      // Required use of an anonymous callback as .open will NOT return a value but simply returns undefined in asynchronous mode
      callback(xobj.responseText);
    }
    //TODO: what to do in case of failures?
  };
  xobj.send(null);
}

function dictToURI(dict) {
  var str = [];
  for (var p in dict) {
    str.push(encodeURIComponent(p) + "=" + encodeURIComponent(dict[p]));
  }
  return str.join("&");
}

// this is a comment
