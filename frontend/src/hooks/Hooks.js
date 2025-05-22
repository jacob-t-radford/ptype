// Node packages
import L from 'leaflet';
import { useEffect, useCallback } from 'react';
import * as d3 from 'd3';
import $ from 'jquery';

// Custom JS
import { drawLinesDots, updateBar, drawBackground, createBar } from '../js/sounding.js';
import { roundToNearest, extractDateComponents } from '../js/utils.js';

// Assets
import markerIcon from '../assets/marker-icon-2x.png';

// Initialize the Leaflet map on page load
export function useMapInit( {setLat, setLon} ) {

    useEffect(() => {

        // Prevents duplicate renders
        if (!window.LeafletMap) {

            async function loadMap() {

                // Initialize the Leaflet map
                window.LeafletMap = L.map('radarmap', {
                    renderer: L.svg(),
                    keyboard: false,
                    center: [43.5, -96],
                    zoom: 5,
                    minZoom: 2,
                    maxZoom: 7,
                    attributionControl: false,
                    maxBounds: new L.LatLngBounds(
                        new L.LatLng(-90, Number.NEGATIVE_INFINITY),
                        new L.LatLng(90, Number.POSITIVE_INFINITY)
                    ),
                    maxBoundsViscosity: 0.25,
                });

                // Central region bounds
                fetch("bounds.geojson")
                    .then(response => response.json())
                    .then(data => {
                        const bounds = L.geoJSON(data, {
                            style: function (feature) {
                                return { color: "blue" };
                            },
                            onEachFeature: function (feature, layer) {
                                if (feature.properties && feature.properties.name) {
                                    layer.bindPopup(feature.properties.name);
                                }
                            }
                        }).addTo(window.LeafletMap);
                    })
                    .catch(err => console.error(err));

                // Open street maps layer
                L.tileLayer(
                    'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
                    {
                        attribution:
                            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
                        subdomains: 'abcd',
                    }
                ).addTo(window.LeafletMap);

                // Load county boundaries
                const counties = await import('../maps/gz_2010_us_050_00_20m.json');
                L.vectorGrid.slicer(counties.default, {
                    rendererFactory: L.svg.tile,
                    zIndex: 1000,
                    vectorTileLayerStyles: {
                        sliced: function(properties, zoom) {
                            var p = properties.mapcolor7 % 5;
                            return {
                                fillOpacity: 0.5,
                                stroke: true,
                                fill: false,
                                color: 'black',
                                weight: 0.1,
                            };
                        }
                    },
                    interactive: false,
                    getFeatureId: function(f) {
                        return f.properties.wb_a3;
                    }
                }).addTo(window.LeafletMap);

                // Load state boundaries
                const states = await import('../maps/usstates_wrap.json');
                L.vectorGrid.slicer(states.default, {
                    rendererFactory: L.svg.tile,
                    zIndex: 1000,
                    vectorTileLayerStyles: {
                        sliced: function(properties, zoom) {
                            var p = properties.mapcolor7 % 5;
                            return {
                                fillOpacity: 0.5,
                                stroke: true,
                                fill: false,
                                color: 'black',
                                weight: 0.5,
                            };
                        }
                    },
                    interactive: false,
                    getFeatureId: function(f) {
                        return f.properties.wb_a3;
                    }
                }).addTo(window.LeafletMap);

                const markerGroup = L.layerGroup().addTo(window.LeafletMap);

                // Listener for clicking Leaflet map to generate sounding
                const mapClickListener = (e) => {
                    const lat = e.latlng.lat;
                    const lng = e.latlng.lng;
                    const roundedLat = roundToNearest(lat, 0.05);
                    const roundedLng = roundToNearest(lng, 0.05);
                    const map = window.LeafletMap;
                    const customIcon = L.icon({
                        iconUrl: markerIcon,
                        iconSize: [25, 41],
                        iconAnchor: [12, 41],
                        popupAnchor: [0, -41]
                    });
                    markerGroup.clearLayers();
                    L.marker([roundedLat, roundedLng], { icon: customIcon }).addTo(markerGroup);
                    setLat(roundedLat);
                    setLon(roundedLng);
                };

                // Disables Leaflet map clicking to prevent overlay menu interference
                const disableClick = () => {
                    const overlaysDiv = document.getElementById('temperature-checkbox');
                    const map = window.LeafletMap;
        
                    overlaysDiv.addEventListener('mouseover', function() {
                        map.off('click', mapClickListener);
                    });
        
                    overlaysDiv.addEventListener('mouseout', function() {
                        map.on('click', mapClickListener);
                    });
                };
        
                window.LeafletMap.on('click',mapClickListener);
                disableClick();

            }
            loadMap()
        }


    }, [])
}

// Initialize skew-t SVG
export function useSkewInit({
    width, height, margin, basep, topp,
    plines, pticks, barbsize, tan,
    rain, snow, icep, frzr, uncertainty,
    setSvg, setBarsvg, setW, setH, setReset
    }) {

    useEffect(() => {

        // Reset button stuff
        const resetButton = document.getElementById("resetButton");
        resetButton.style.border = "2px solid red";
        const resetfunc = () => setReset(prev => !prev);
        resetButton?.addEventListener("click", resetfunc);

        // Hide warning
        document.getElementById("warning").style.visibility = "hidden";

        // Sounding SVG sizing
        const w = width - margin[1] - margin[3];
        const h = height - margin[0] - margin[2];
        const x = d3.scaleLinear().range([0, w]).domain([-35, 30]);
        const y = d3.scaleLog().range([0, h]).domain([topp, basep]);

        // Draw background of the chart
        const svg = drawBackground(margin, w, h, basep, topp, plines, pticks, barbsize, tan, x, y);
        
        // Create bar chart
        const barsvg = createBar(rain, snow, icep, frzr, uncertainty);
        setSvg(svg);
        setBarsvg(barsvg);
        setW(w);
        setH(h);
        
        // Prevents duplicate SVGs
        return () => {
            resetButton?.removeEventListener("click", resetfunc);
            d3.select("#sounding-svg").remove();
            d3.select("#bar-svg").remove();
        };
        
    },[])
}

// Hover readouts
export function useAjaxReadout({ selectedDate, selectedInitialization, draggingSliderValue }) {
    return useCallback((e) => {

        // Round lats/lons
        const lathov = e.latlng.lat;
        const lnghov = e.latlng.lng;
        const lat = roundToNearest(lathov, 0.05);
        const lon = roundToNearest(lnghov, 0.05);

        // Format request
        const request = {
            lat,
            lon,
            date: selectedDate,
            initialization: selectedInitialization,
            forecastHour: draggingSliderValue
        };

        // Flask API request
        $.ajax({
            url: '/retrieveValue',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(request),
            success: (data) => {
                const rain = (data.rain * 100).toFixed(1);
                const snow = (data.snow * 100).toFixed(1);
                const icep = (data.icep * 100).toFixed(1);
                const frzr = (data.frzr * 100).toFixed(1);

                document.getElementById("readouttext").innerHTML =
                    `RAIN: ${rain}%<br>SNOW: ${snow}%<br>ICEP: ${icep}%<br>FRZR: ${frzr}%<br>`;
            },
            error: console.error
        });
    }, [selectedDate, selectedInitialization, draggingSliderValue]);
}

// Event listeners for mouse moves on map 
export function useMapMouseEvents(handleMouseMove, handleMouseLeave) {
    useEffect(() => {
        const map = window.LeafletMap;

        if (!map) return;

        // Remove previous listeners (just in case)
        map.off('mousemove', handleMouseMove);
        map.off('mouseleave', handleMouseLeave);

        // Attach new listeners
        map.on('mousemove', handleMouseMove);
        map.on('mouseout', handleMouseLeave);

        // Cleanup on unmount or dependency change
        return () => {
            map.off('mousemove', handleMouseMove);
            map.off('mouseout', handleMouseLeave);
        };
    }, [handleMouseMove, handleMouseLeave]);
}

// Main ptype layer
export function usePtypeLayerLoader({ selectedDate, selectedInitialization, sliderValue }) {
    useEffect(() => {

        // Get date + fhour info
        const { year, month, day, hh, fhour } = extractDateComponents(selectedDate, selectedInitialization, sliderValue);

        // Clear existing layers
        const clearLayers = () => {
            if (window.LeafletMap?.eachLayer) {
                window.LeafletMap.eachLayer((layer) => {
                    if (layer.options?.myid === 1) {
                        window.LeafletMap.removeLayer(layer);
                    }
                });
            }
        };

        clearLayers();

        // Load each ptype layer
        const layers = ['rain', 'snow', 'icep', 'frzr'];
        layers.forEach((ptype) => {
            const dir = `evi_${ptype}`;
            const filename = `MILES_ptype_evi_${year}-${month}-${day}_${hh}00_f${fhour}_${ptype}.geojson`;
            const fullPath = `${dir}/${filename}`;

            d3.json(fullPath)
                .then((response) => {
                    const data = response;

                    const testGrid = L.vectorGrid.slicer(data, {
                        rendererFactory: L.svg.tile,
                        opacity: 1,
                        zIndex: 100,
                        myid: 1,
                        vectorTileLayerStyles: {
                            sliced: function (properties, zoom) {
                                return {
                                    fillOpacity: 0.9,
                                    stroke: false,
                                    fill: true,
                                    color: properties.fill,
                                    fillColor: properties.fill,
                                };
                            }
                        },
                        interactive: true,
                        getFeatureId: function (f) {
                            return f.properties.wb_a3;
                        }
                    }).addTo(window.LeafletMap);
                })
                .catch((error) => {
                    console.error(`Error loading ${fullPath}:`, error);
                });
        });
    }, [selectedDate, selectedInitialization, sliderValue]);
}

// Retrieve skew-t with Flask API
export function useSoundingData({
    lat,
    lon,
    selectedDate,
    selectedInitialization,
    sliderValue,
    reset,
    setTemp,
    setDpt,
    setPres,
    setRain,
    setSnow,
    setIcep,
    setFrzr,
    setUwind,
    setVwind,
    setMetrics,
    setUncertainty,
    setMod
  }) {
    useEffect(() => {
      if (lat && lon) {

        // Controls whether skew-t has been modified
        setMod(0);
        document.getElementById("warning").style.visibility = "hidden";
        document.getElementById("barchart").style.border = "3px solid white";
  
        // Flask API formatted request
        const coordinates = {
          lat: lat,
          lon: lon,
          date: selectedDate,
          initialization: selectedInitialization,
          forecastHour: sliderValue
        };
  
        // Retrieve skew-t data, p-type probs, and metrics for given lat/lon + time
        $.ajax({
          url: '/getCSV',
          data: JSON.stringify(coordinates),
          type: 'POST',
          contentType: "application/json",
          success: (data) => {
            setDpt(data.dewpoint);
            setTemp(data.temperature);
            setPres(data.pressure);
            setRain(parseFloat(data.rain.toFixed(2)));
            setSnow(parseFloat(data.snow.toFixed(2)));
            setIcep(parseFloat(data.icep.toFixed(2)));
            setFrzr(parseFloat(data.frzr.toFixed(2)));
            setUwind(data.uwind);
            setVwind(data.vwind);
            setMetrics(data.metrics);
            setUncertainty(data.uncertainty.toFixed(2));
          },
          error: (error) => {
            console.log(error);
          }
        });
      }
    }, [selectedDate, selectedInitialization, sliderValue, lat, lon, reset]);
  }

// Redraws skew-t if temp or dpt change
export function useSoundingPlot({
    temp,
    dpt,
    pres,
    w,
    h,
    basep,
    topp,
    tan,
    svg,
    barsvg,
    selectedDate,
    selectedInitialization,
    sliderValue,
    rain,
    snow,
    icep,
    frzr,
    uncertainty,
    rhLock,
    setTemp,
    setDpt,
    setMod
}) {
    useEffect(() => {
        if (temp !== undefined) {
            // Clear existing circles and paths
            svg.selectAll("g")
                .filter(function () {
                    return this.id.startsWith('group-temppath');
                })
                .remove();
            svg.selectAll("g")
                .filter(function () {
                    return this.id.startsWith('group-dptpath');
                })
                .remove();

            svg.selectAll("circle").remove();
            svg.selectAll(".handle").remove();
            svg.select("#temppath").remove();
            svg.select("#dptpath").remove();

            // Draw new temperature and dewpoint lines and dots
            drawLinesDots(temp, pres, w, h, basep, topp, tan, svg, "red", "temppath", setTemp, selectedDate, selectedInitialization, sliderValue, setMod, setDpt, dpt, rhLock);
            drawLinesDots(dpt, pres, w, h, basep, topp, tan, svg, "green", "dptpath", setDpt, selectedDate, selectedInitialization, sliderValue, setMod, setTemp, temp, rhLock);

            // Update the bar chart
            updateBar(barsvg, rain, snow, icep, frzr, selectedDate, selectedInitialization, sliderValue, uncertainty);
        }
    }, [temp, dpt, rhLock]);
}

// Function to send modified skew-t data to Flask API and get new predictions
export function useSendModifiedSounding({
    mod,
    temp,
    dpt,
    uwind,
    vwind,
    setRain,
    setSnow,
    setIcep,
    setFrzr,
    setUncertainty,
    setMetrics,
    barsvg,
    selectedDate,
    selectedInitialization,
    sliderValue
}) {
    useEffect(() => {
        // Only do this stuff if it's been modified
        // Otherwise changing dates, etc. will also trigger this
        if (mod === 1) {

            // Formatted API data
            const tempdpt = {
                temperature: temp,
                dewpoint: dpt,
                uwind: uwind,
                vwind: vwind
            };

            // Send skew-t data and retrieve predictions
            $.ajax({
                url: '/modSounding',
                data: JSON.stringify(tempdpt),
                type: 'POST',
                contentType: "application/json",
                success: (data) => {
                    const rainVal = parseFloat(data.rain.toFixed(2));
                    const snowVal = parseFloat(data.snow.toFixed(2));
                    const icepVal = parseFloat(data.icep.toFixed(2));
                    const frzrVal = parseFloat(data.frzr.toFixed(2));
                    const uncertaintyVal = parseFloat(data.uncertainty.toFixed(2));

                    setRain(rainVal);
                    setSnow(snowVal);
                    setIcep(icepVal);
                    setFrzr(frzrVal);
                    setUncertainty(uncertaintyVal);
                    setMetrics(data.metrics);

                    // Update bar chart
                    updateBar(
                        barsvg,
                        rainVal,
                        snowVal,
                        icepVal,
                        frzrVal,
                        selectedDate,
                        selectedInitialization,
                        sliderValue,
                        uncertaintyVal
                    );
                },
                error: (error) => {
                    console.error(error);
                }
            });
        }
    }, [mod, temp, dpt]);
}
