let map;

function initMap() {
    const mapOptions = {
        center: { lat: 25.795, lng: -80.207 },
        zoom: 14
    };

    map = new google.maps.Map(document.getElementById('map'), mapOptions);
}
