var wssearch;
var knownLocations = {};
var locationsOnTheMap = {};
var map;
var geocoder;
var QltMin = 500;
var QltMax = 120000;
var qlTimeout = QltMin;
var ntweets;
var ntweetsinerror;
var ntweetsdiscarded;
var qtime;
var ptimer;
var msgq;
var hometown = new google.maps.LatLng(30.05, -97.14);

// Update stats panel
//
function updateStats() {
  document.getElementById('num-tweets').value = ntweets;
  document.getElementById('num-tweets-in-error').value = ntweetsinerror;
  document.getElementById('num-tweets-discarded').value = ntweetsdiscarded;
  document.getElementById('tweets-per-sec').value = new Number((ntweets * 1000) / (new Date().getTime() - qtime)).toFixed(2);
}

// set home location
function  setHome() {
  var latitude = document.getElementById('latitude').value;
  var longitude = document.getElementById('longitude').value;
  hometown = new google.maps.LatLng(latitude, longitude);
}

// Add a delay in writing msgs to the map to mitigate
// the query_limit error returned by the geocoder service
// when calling it too frequently.
//
function processMsg() {
  var msg = msgq.shift();
  if ( msg !== undefined ) {
    // write to map
    writeToMap(msg);
  }
  updateStats();
  ptimer = setTimeout(processMsg, qlTimeout);
}

function initialize() {
  // Create the map and initialize the geocoder.
  setHome();
  var mapOptions = {
    zoom: 7,
    center: hometown,
    mapTypeId: google.maps.MapTypeId.TERRAIN,
    streetViewControl: false,
  };

  map = new google.maps.Map(document.getElementById('map-canvas'), mapOptions);

  var homeControlDiv = document.createElement('div');
  var homeControl = new HomeControl(homeControlDiv, map);
  homeControlDiv.index = 1;
  map.controls[google.maps.ControlPosition.TOP_RIGHT].push(homeControlDiv);

  geocoder = new google.maps.Geocoder();
}


// Make a home control button that returns the map view to the user's set home location

function HomeControl(controlDiv, map) {

  // Set CSS styles for the DIV containing the control
  // Setting padding to 5 px will offset the control
  // from the edge of the map
  controlDiv.style.padding = '5px';

  // Set CSS for the control border
  var controlUI = document.createElement('div');
  controlUI.style.backgroundColor = 'white';
  controlUI.style.borderStyle = 'solid';
  controlUI.style.borderWidth = '2px';
  controlUI.style.cursor = 'pointer';
  controlUI.style.textAlign = 'center';
  controlUI.title = 'Click to set the map to Home';
  controlDiv.appendChild(controlUI);

  // Set CSS for the control interior
  var controlText = document.createElement('div');
  controlText.style.fontFamily = 'Arial,sans-serif';
  controlText.style.fontSize = '12px';
  controlText.style.paddingLeft = '4px';
  controlText.style.paddingRight = '4px';
  controlText.innerHTML = '<b>Home</b>';
  controlUI.appendChild(controlText);

  // Setup the click event listeners: simply set the map to
  // Chicago
  google.maps.event.addDomListener(controlUI, 'click', function() {
    setHome(),
    map.setCenter(hometown)
  });

}


function dropACircle(loc, tweet) {
  var address = loc.adr;
  var geoLatLong = loc.geo;
  var count = loc.count;

  var circleOptions = {
        strokeColor: '#FF0000',
        strokeOpacity: 0.8,
        strokeWeight: 2,
        fillColor: '#F00000',
        fillOpacity: 0.35,
        map: map,
        center: geoLatLong,
        position: geoLatLong,
        title: address,
        radius: 10000 * count
  };

  var winContent = '<div id="content">'+
      '<div id="siteNotice">'+
      '</div>'+
      '<h1 id="firstHeading" class="firstHeading">' + address + ' (' + count + ')</h1>'+
      '<div id="bodyContent"><p>' + tweet + '</p>' +
      '</div>'+
      '</div>';

  if ( loc.infowin === undefined ) {
    loc.infowin = new google.maps.InfoWindow({
        content: winContent
    });
  } else {
    loc.infowin.setContent(winContent);
  }

  if ( loc.circle ) {
    loc.circle.setMap(null);
    loc.circle = null;
  }

  // Add the circle to the map.
  loc.circle = new google.maps.Circle(circleOptions);

  // Add a listener for the infowindow
  google.maps.event.addListener(loc.circle, 'click', function() {
    loc.infowin.open(map, loc.circle);
  });

  // Add animation effect: bounce a tweet on the circle
  var marker = new google.maps.Marker({
    position: geoLatLong,
    icon: 'twitter.png',
    animation: google.maps.Animation.BOUNCE
  });

  // Bounce 2 seconds
  marker.setMap(map);
  setTimeout(function() {
    marker.setMap(null);
    marker = null;
  }, 2000);

  ntweets += 1;
}

function writeToMap(msg) {
  // Check known locations first
  //
  var address = msg.address;
  var tweet = msg.text;

  // Don't waste time if tweet location is unset
  //
  if ( address.length==0 ) {
    console.warn('Address not set in tweet. Discarding.');
    ntweetsinerror+=1;

    // Adjust the timeout of next msg processing
    if ( qlTimeout > QltMin ) {
      qlTimeout /= 2;
    }
    return;
  }

  var cloc = knownLocations[address];
  if ( cloc === undefined ) {
    geocoder.geocode( { 'address': address}, function(results, status) {
      if (status == google.maps.GeocoderStatus.OK) {
        // Save to known locations
        //
        var fadr = results[0].formatted_address;
        knownLocations[address] = fadr;
        if ( locationsOnTheMap[fadr]===undefined ) {
          // create the entries
          locationsOnTheMap[fadr] = {geo: results[0].geometry.location, adr: fadr, count: 1};
        } else {
          // entry has been created by another call to geocode, just update it
          //
          locationsOnTheMap[fadr].count++;
        }
        dropACircle(locationsOnTheMap[fadr], tweet);

        // Adjust the timeout of next msg processing
        if ( qlTimeout > QltMin ) {
          qlTimeout /= 2;
        }
      } else if ( status == google.maps.GeocoderStatus.OVER_QUERY_LIMIT ) {
        // Discard the message and slow down processing
        //
        ntweetsdiscarded+=1;
        qlTimeout *= 2;
        if ( qlTimeout > QltMax ) {
          alert('Waiting too long on the geocoder service.');
          qlTimeout = QltMin;
        }
      } else {
        console.warn('Geocode for *' + address + '* was not successful for the following reason: ' + status);
        ntweetsinerror+=1;

        // Adjust the timeout of next msg processing
        if ( qlTimeout > QltMin ) {
          qlTimeout /= 2;
        }
      }
    });
  } else {
    console.info('Location *' + address + '* is known. No need to call google geocode service.');
    locationsOnTheMap[cloc].count++;
    dropACircle(locationsOnTheMap[cloc], tweet);

    // Adjust the timeout of next msg processing
    if ( qlTimeout > QltMin ) {
      qlTimeout /= 2;
    }
  }
}

function onClose(e) {
  alert('Server closed the connection.\nCode: '
    + e.code + '\nReason: ' + e.reason + '\nWasClean: ' + e.wasClean);

  stopProcessing();
}

function onMessage(e) {
  // Got a tweet, queue for processing
  //
  var msg = JSON.parse(e.data);
  msgq.push(msg);
}

function onError(e) {
  // The onClose() is being called shortly
  //
  console.error(e);
}

function onOpen(e) {
  // Submit the search to the server
  //
  var search = document.getElementById('search').value.trim();
  wssearch.send(search);
}

// Empty the msgq and clear processMsg() schedule
//
function stopProcessing() {
  msgq = [];
  if ( ptimer ) {
    clearInterval(ptimer);
  }
}

function startSearch() {
  var search = document.getElementById('search').value;
  if ( search.trim().length===0 ) {
    alert('Cannot submit an empty search.');
    return;
  }

  if ( wssearch ) {
    wssearch.onclose = function() {};
    wssearch.close();
  }

  stopProcessing();

  // Clear the map: loop on locationsOnTheMap and remove circles
  //
  for (var k in locationsOnTheMap) {
    locationsOnTheMap[k].count = 0;
    delete locationsOnTheMap[k].infowin;
    if ( locationsOnTheMap[k].circle ) {
      locationsOnTheMap[k].circle.setMap(null);
    }
    delete locationsOnTheMap[k].circle;
  }

  // Reset ptimer
  //
  qtime = new Date().getTime();
  ntweets = 0;
  ntweetsinerror = 0;
  ntweetsdiscarded = 0;

  // Create the connection for the new search
  //
  if ( window.document.location.host.match(/localhost/) ) {
    var wsUri = 'ws://' + window.document.location.host + '/search';
  } else {
    var wsUri = 'wss://' + window.document.location.host + '/search';
  }
  wssearch = new WebSocket(wsUri);
  wssearch.onopen = function(evt) { onOpen(evt) };
  wssearch.onclose = function(evt) { onClose(evt) };
  wssearch.onmessage = function(evt) { onMessage(evt) };
  wssearch.onerror = function(evt) { onError(evt) };

  alert('Query ' + search + ' sent.\n You should get tweets bouncing on the map shortly.');

  // Start processing messages
  //
  processMsg();
}

google.maps.event.addDomListener(window, 'load', initialize);

