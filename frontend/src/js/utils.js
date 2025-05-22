import dayjs from 'dayjs';
import 'leaflet-textpath';

// Round latitudes and longitudes
export const roundToNearest = (value, step) => {
    return Math.round(value / step) * step;
};

// Get date info
export const extractDateComponents = (date, initialization, sliderValue) => {
    const year = date.toISOString().substring(0, 4);
    const month = date.toISOString().substring(5, 7);
    const day = date.toISOString().substring(8, 10);
    const hh = initialization.substring(0, 2);
    const fhour = sliderValue.toString().padStart(2, '0');
    return { year, month, day, hh, fhour };
};

// Calculates the valid date and time based on the slider value.
export const calculateValidDateTime = (sliderVal, selectedDate, selectedInitialization) => {
    const baseDate = dayjs(selectedDate).startOf('day'); // Start of the selected date
    const initializationHour = selectedInitialization === '00Z' ? 0 : 12; // Convert initialization to hours
    const totalHours = initializationHour + parseInt(sliderVal, 10); // Total hours to add
    return baseDate.add(totalHours, 'hour').format('YYYY-MM-DD HH:mm [UTC]');
};

// Debounce to avoid firing stuff constantly
export const debounce = (func, delay) => {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
};

// Styling for overlay layers
export const styleFeatureLayer = (key, feature, layer, hue, minVal, maxVal) => {
    const value = feature.properties['level-value'];
    const normalizedValue = (value - minVal) / (maxVal - minVal);
    let weight = 2;
    let dash = '0, 0';

    // Lots of different cases
    // These have different styling for neg/pos
    if (["hrrr_t", "hrrr_td", "hrrr_u10", "hrrr_v10", "hrrr_wb"].includes(key)) {
        var label = feature.properties['level-value'].toString();
        var color = `hsl(${hue}, 100%, ${50 - (normalizedValue * 50)}%)`;
        if (value < 0) dash = '3, 3';
        else if (value === 0) weight = 3;

    // These have different color settings
    } else if (["hrrr_rain", "hrrr_snow", "hrrr_icep", "hrrr_frzr"].includes(key)) {
        var label = ""
        var color = `hsl(${hue}, 100%, 50%)`;

    // These have different label settings
    } else if (["hrrr_mslp"].includes(key)) {
        var label = (parseFloat(feature.properties['level-value']) / 100).toString() 
        var color = `hsl(${hue}, 100%, ${50 - (normalizedValue * 50)}%)`;

    // These have different color settings (same as first case but no neg/pos option)
    } else if (["evi_uncertainty"].includes(key)) {
        var label = feature.properties['level-value'].toString();
        var color = `hsl(${hue}, 100%, ${50 - (normalizedValue * 50)}%)`;
    }

    layer.setStyle({
        color,
        weight,
        dashArray: dash,
        dashOffset: '0',
    });

    // Set contour labels
    layer.setText(
        label,
        {
            attributes: {
                fill: color,
                'font-size': '1.3em',
                'font-weight': 'bold'
            }
        }
    );


};
