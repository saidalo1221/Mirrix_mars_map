const photoCredit = 'NASA/JPL-Caltech/ASU/MSSS';

export const JEZERO_MISSION = {
  name:'Jezero western fan · Reading the delta',
  goal:'Compare visible sediment layering across the western fan margin in three proposed observations.',
  settings:{objective:'science', maxMinutes:200, maxKm:7, speed:.8, maxSlope:15, terrainWeight:2,
    stopMinutes:8, equipmentMinutes:200, reserveMinutes:20, carriedKg:10, crewMode:'pair', roverSpeed:1.5},
  stops:[
    {lat:18.449, lon:77.438, name:'Fan approach', description:'Photograph the fan silhouette and record where layered outcrops first become visible.',
      photo:{url:'./assets/maps/perseverance-delta.jpg', sourceUrl:'https://science.nasa.gov/photojournal/perseverance-view-of-the-delta-in-jezero-crater/',
        credit:photoCredit, caption:'Perseverance Mastcam-Z view from the landing area toward the delta.'}},
    {lat:18.451, lon:77.425, name:'Fan margin', description:'Compare the apparent orientation and continuity of beds at a distant exposure.',
      photo:{url:'./assets/maps/perseverance-delta-scarp.jpg', sourceUrl:'https://science.nasa.gov/photojournal/two-views-of-delta-scarp/',
        credit:'RMI: NASA/JPL-Caltech/LANL/CNES/CNRS/ASU/MSSS. Mastcam-Z: NASA/JPL-Caltech/ASU/MSSS.', caption:'Perseverance Mastcam-Z and SuperCam imagery of the Delta Scarp.'}},
    {lat:18.453, lon:77.414, name:'Fan-front comparison', description:'Look for changes in layer thickness or visible textures and record where the view is uncertain.',
      photo:{url:'./assets/maps/perseverance-fan-panorama.jpg', sourceUrl:'https://science.nasa.gov/resource/detailed-panorama-of-mars-jezero-crater-delta/',
        credit:photoCredit, caption:'Perseverance Mastcam-Z regional delta panorama preview, sols 466–474.'}},
  ],
};

export const RADIATION_SOURCES = [
  {name:'Curiosity RAD historic surface measurements',sourceUrl:'https://science.nasa.gov/resource/radiation-measurements-on-mars/',
    attribution:'NASA/JPL-Caltech/SwRI · Gale Crater, August 2012 to June 2013'},
  {name:'May 2024 solar particle event',sourceUrl:'https://science.nasa.gov/resource/curiosity-sees-specks-caused-by-2024-solar-storm-while-recording-a-wind-gust-on-mars/',
    attribution:'NASA/JPL-Caltech · Mars historical space-weather context'},
];
