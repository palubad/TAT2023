// ========================================================================================
// --------------------------- 0. DESCRIPTION  --------------------------------------------
// ========================================================================================
/*
Author: Daniel Paluba, EO4Landscape research group, Charles University
This code was developed specifically for the TAT 2023 training.

This code performs a time series analysis of Sentinel-2 and Sentinel-1 data. 
It begins by setting the start and end dates for the analysis and selecting 
a specific area of interest. 
The code then loads and filters the Sentinel-2 and Sentinel-1 data based on 
the defined parameters. Functions are defined to add optical vegetation indices 
and SAR polarimetric indices to the image collections. A cloud masking function 
and converting SAR data to decibel scale are also added.
The code further creates time series charts for the selected optical vegetation 
indices and SAR features.

Note: This is the "solution" code - how the final should look like.

© This code is published under MIT License: 
https://github.com/palubad/TAT2023/blob/main/LICENSE
*/

// ========================================================================================
// --------------------------- 1. INITIAL SETTINGS  ---------------------------------------
// ========================================================================================
// Predefined points
var point1 = /* color: #98ff00 */ee.Geometry.Point([14.826519726417349, 49.793139465625394]),
    point2 = /* color: #0b4a8b */ee.Geometry.Point([14.824955315575478, 49.795850547641166]);

// set start and end date
var startDate = '2019-01-01',
    endDate = '2023-06-28';

// select for which point to do the time series analysis
// -- select fron the predefined points: point1 = coniferous; point2 = deciduous forest
// -- or draw your own point/polygon and replace it in the code
var selected = point2;

// set the maximum threshold for single image cloud coverage
var max_clouds = 50;

// define which optical and SAR feature we want to display
var listOfOpticalVIs = ['NDVI', 'EVI', 'NBR', 'NDMI'];
var listOfSARfeatures = ['VV','VH','RVI', 'RFDI'];

// Center map view to the selected point
Map.centerObject(selected,17);

// ========================================================================================
// --------------------------- 2. LOAD THE DATA  ------------------------------------------
// ========================================================================================
// Load Sentinel-1 data
var S1Collection = ee.ImageCollection('COPERNICUS/S1_GRD_FLOAT')
                  .filterBounds(selected)
                  .filterDate(startDate, endDate)
                  
                  // UNCOMMENT if you want to use only images from the same path and orbit 
                  // .filter(ee.Filter.eq('orbitProperties_pass','ASCENDING'))
                  // .filter(ee.Filter.lt('relativeOrbitNumber_start',146));

// Check out the size of our S1 image collection
print('S-1 collection size:', S1Collection.size());

// Load Sentinel-2 data
var S2 = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
          .filterBounds(selected)
          .filterDate(startDate, endDate)
          .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE',max_clouds));

// Check out the size of our S2 image collection
print('S-2 collection size:', S2.size());

// ========================================================================================
// --------------------------- 3. DEFINE FUCTIONS -----------------------------------------
// ========================================================================================

// Load the function to mask out clouds, their shadows and snow cover in Sentinel-2 images
// using the combination of 4 different cloud-shadow-snow masking approaches
var maskClouds = require('users/danielp/functions:maskClouds_S2');

// Function to add optical vegetation indices (VI)
var addOpticalVI = function(img) {
  var EVI = img.expression(
        '2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))', {
            'NIR': img.select('B8').divide(10000),
            'RED': img.select('B4').divide(10000),
            'BLUE': img.select('B2').divide(10000)
        }).rename("EVI")
  
  var NDVI = img.normalizedDifference(['B8', 'B4']).rename('NDVI'), 
      // Normalized Difference Vegetation Index
      NDWI = img.normalizedDifference(['B3', 'B8']).rename('NDWI'), 
      // Normalized Difference Wetness Index
      NDMI = img.normalizedDifference(['B8', 'B11']).rename('NDMI'), 
      // Normalized Difference Moisture Index
      NBR = img.normalizedDifference(['B8', 'B12']).rename('NBR'); 
      // Normalized Burn Ratio
  
  return img
    .addBands([EVI, NDVI,NDWI, NDMI, NBR])
    .copyProperties(img,img.propertyNames());
};

// change linear units to dB
var powerToDb = function powerToDb (img){
  return ee.Image(10).multiply(img.log10()).copyProperties(img,img.propertyNames());
};

// Function to add SAR Polarimetric indices
var addSARIndices = function(img) {
  var VV = ee.Image(img.select('VV')),
      VH = ee.Image(img.select('VH'));
              
  var RVI = (ee.Image(4).multiply(VH))
            .divide(VV.add(VH)).rename('RVI'); // Radar Vegetation Index
  
  var RFDI = (VV.subtract(VH))
            .divide(VV.add(VH)).rename('RFDI'); // Radar Forest Degredation Index
  
  return img.select('angle')
            .addBands([ee.Image(powerToDb(VH)).rename('VH'), 
                      // Change linear to dB scale
                      ee.Image(powerToDb(VV)).rename('VV'),
                      // Change linear to dB scale
                      RVI, RFDI]);
};


// ========================================================================================
// --------------------------- 4. APPLY THE FUCTIONS --------------------------------------
// ========================================================================================

// Apply the function to mask out clouds, their shadows and snow cover in Sentinel-2 images
S2 = maskClouds.maskClouds(S2,startDate,endDate,selected,max_clouds);

// Add optical vegetation indices and select only the defined optical vegetation indices
S2 = S2.map(addOpticalVI).select(listOfOpticalVIs)

// Add SAR polarimetric indices, convert VV and VH to dB scale and select the SAR features
S1Collection = S1Collection.map(addSARIndices).select(listOfSARfeatures);

// Explore the S2 data
print(S2, 'S2 Image collection');

// Explore the S1 data
print(S1Collection, 'S1 Image collection');


// ========================================================================================
// --------------------------- 5. CREATE TIME SERIES CHARTS  ------------------------------
// ========================================================================================

// Explore Time series of SAR and optical data
// Create charts
var IndicesChartOriginal = ui.Chart.image.series({
    imageCollection: S2.select(listOfOpticalVIs),
    region: selected.buffer(50),
    reducer: ee.Reducer.mean(),
    scale: 20,
}).setOptions({
    title: 'Time-series of optical VI'
});

// display the TS chart in the Console
print('Time-series of optical VI', IndicesChartOriginal);


var VVVHChart = ui.Chart.image.series({
    imageCollection: S1Collection.select(['VV','VH']),
    region: selected.buffer(50),
    reducer: ee.Reducer.mean(),
    scale: 20,
}).setOptions({
    title: 'Time-series of SAR VV & VH'
});

// display the TS chart in the Console
print('Time-series of SAR VV & VH', VVVHChart);

var IndicesChartSAR = ui.Chart.image.series({
    imageCollection: S1Collection.select(['RVI', 'RFDI']),
    region: selected.buffer(50),
    reducer: ee.Reducer.mean(),
    scale: 20,
}).setOptions({
    title: 'Time-series of SAR RVI & RFDI'
});

// display the TS chart in the Console
print('Time-series of SAR RVI', IndicesChartSAR);
