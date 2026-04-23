// Parsed from topo_test.txt — real cell topology data

export interface TopoCell {
  siteId: string;
  siteName: string;
  region: string;
  lng: number;
  lat: number;
  cellName: string;
  techno: string;
  bande: string;
  vendor: string;
  azimut: number;
  plaque: string;
  hba: number;
  zoneArcep: string;
  essentiel: string;
  cluster?: string;
}

const raw: TopoCell[] = [
  { siteId:"00019213F4", siteName:"ZUYDCOOTE", region:"UPR Nord-Est", lng:-1.575584383, lat:47.22079836, cellName:"ZUYDCOOTE_H1", techno:"4G", bande:"LTE1800", vendor:"ericsson", azimut:120, plaque:"LITTORAL_DUNKERQUE", hba:34, zoneArcep:"AXE", essentiel:"" },
  { siteId:"00019213F4", siteName:"ZUYDCOOTE", region:"UPR Nord-Est", lng:-1.500899372, lat:47.26200019, cellName:"ZUYDCOOTE_Y2", techno:"5G", bande:"NR_700", vendor:"ericsson", azimut:300, plaque:"LITTORAL_DUNKERQUE", hba:34, zoneArcep:"AXE", essentiel:"Sites stratégiques" },
  { siteId:"00019213F4", siteName:"ZUYDCOOTE", region:"UPR Nord-Est", lng:-1.561949217, lat:47.21963917, cellName:"ZUYDCOOTE_F2", techno:"4G", bande:"LTE800", vendor:"ericsson", azimut:300, plaque:"LITTORAL_DUNKERQUE", hba:34, zoneArcep:"AXE", essentiel:"" },
  { siteId:"00019213F4", siteName:"ZUYDCOOTE", region:"UPR Nord-Est", lng:-1.532950674, lat:47.24036768, cellName:"ZUYDCOOTE_V1", techno:"4G", bande:"LTE2100", vendor:"ericsson", azimut:120, plaque:"LITTORAL_DUNKERQUE", hba:34, zoneArcep:"AXE", essentiel:"" },
  { siteId:"00019213F4", siteName:"ZUYDCOOTE", region:"UPR Nord-Est", lng:-1.522191984, lat:47.22285949, cellName:"ZUYDCOOTE_H2", techno:"4G", bande:"LTE1800", vendor:"ericsson", azimut:300, plaque:"LITTORAL_DUNKERQUE", hba:34, zoneArcep:"AXE", essentiel:"" },
  { siteId:"00019213F4", siteName:"ZUYDCOOTE", region:"UPR Nord-Est", lng:-1.626327632, lat:47.22101924, cellName:"ZUYDCOOTE_F1", techno:"4G", bande:"LTE800", vendor:"ericsson", azimut:120, plaque:"LITTORAL_DUNKERQUE", hba:34, zoneArcep:"AXE", essentiel:"" },
  { siteId:"00019213F4", siteName:"ZUYDCOOTE", region:"UPR Nord-Est", lng:-1.464211519, lat:47.25155208, cellName:"ZUYDCOOTE_T1", techno:"5G", bande:"NR_3500", vendor:"ericsson", azimut:120, plaque:"LITTORAL_DUNKERQUE", hba:36, zoneArcep:"AXE", essentiel:"Sites stratégiques" },
  { siteId:"00019213F4", siteName:"ZUYDCOOTE", region:"UPR Nord-Est", lng:-1.574966756, lat:47.20783154, cellName:"ZUYDCOOTE_V2", techno:"4G", bande:"LTE2100", vendor:"ericsson", azimut:300, plaque:"LITTORAL_DUNKERQUE", hba:34, zoneArcep:"AXE", essentiel:"" },
  { siteId:"00019213F4", siteName:"ZUYDCOOTE", region:"UPR Nord-Est", lng:-1.562454276, lat:47.21441621, cellName:"ZUYDCOOTE_Y1", techno:"5G", bande:"NR_700", vendor:"ericsson", azimut:120, plaque:"LITTORAL_DUNKERQUE", hba:34, zoneArcep:"AXE", essentiel:"Sites stratégiques" },
  { siteId:"00019213F4", siteName:"ZUYDCOOTE", region:"UPR Nord-Est", lng:-1.590049848, lat:47.23920275, cellName:"ZUYDCOOTE_T2", techno:"5G", bande:"NR_3500", vendor:"ericsson", azimut:300, plaque:"LITTORAL_DUNKERQUE", hba:36, zoneArcep:"AXE", essentiel:"Sites stratégiques" },
  { siteId:"00034635A1", siteName:"ZPH_PERNANT", region:"UPR Nord-Est", lng:-1.51374604, lat:47.28147594, cellName:"ZPH_PERNANT_F2", techno:"4G", bande:"LTE800", vendor:"ericsson", azimut:270, plaque:"Zones_Blanches_A1", hba:21, zoneArcep:"top15", essentiel:"" },
  { siteId:"00034635A1", siteName:"ZPH_PERNANT", region:"UPR Nord-Est", lng:-1.548965417, lat:47.20450515, cellName:"ZPH_PERNANT_F1", techno:"4G", bande:"LTE800", vendor:"ericsson", azimut:0, plaque:"Zones_Blanches_A1", hba:21, zoneArcep:"top15", essentiel:"" },
  { siteId:"00034635A1", siteName:"ZPH_PERNANT", region:"UPR Nord-Est", lng:-1.55386292, lat:47.21660698, cellName:"ZPH_PERNANT_K2", techno:"4G", bande:"LTE700", vendor:"ericsson", azimut:270, plaque:"Zones_Blanches_A1", hba:21, zoneArcep:"top15", essentiel:"" },
  { siteId:"00034635A1", siteName:"ZPH_PERNANT", region:"UPR Nord-Est", lng:-1.543639969, lat:47.240783, cellName:"ZPH_PERNANT_K1", techno:"4G", bande:"LTE700", vendor:"ericsson", azimut:0, plaque:"Zones_Blanches_A1", hba:21, zoneArcep:"top15", essentiel:"" },
  { siteId:"00000048L2", siteName:"ZOUFFTGEN", region:"UPR Nord-Est", lng:0.741156, lat:47.38551441, cellName:"ZOUFFTGEN_F3", techno:"4G", bande:"LTE800", vendor:"ericsson", azimut:210, plaque:"DEPT_57", hba:37, zoneArcep:"top15", essentiel:"" },
  { siteId:"00000048L2", siteName:"ZOUFFTGEN", region:"UPR Nord-Est", lng:-2.217748431, lat:47.279642, cellName:"ZOUFFTGEN_H1", techno:"4G", bande:"LTE1800", vendor:"ericsson", azimut:0, plaque:"DEPT_57", hba:37, zoneArcep:"top15", essentiel:"" },
  { siteId:"00000048L2", siteName:"ZOUFFTGEN", region:"UPR Nord-Est", lng:-1.423050353, lat:46.67894494, cellName:"ZOUFFTGEN_V1", techno:"4G", bande:"LTE2100", vendor:"ericsson", azimut:0, plaque:"DEPT_57", hba:37, zoneArcep:"top15", essentiel:"" },
  { siteId:"00000048L2", siteName:"ZOUFFTGEN", region:"UPR Nord-Est", lng:-1.440380227, lat:46.6705634, cellName:"ZOUFFTGEN_H3", techno:"4G", bande:"LTE1800", vendor:"ericsson", azimut:210, plaque:"DEPT_57", hba:37, zoneArcep:"top15", essentiel:"" },
  { siteId:"00000048L2", siteName:"ZOUFFTGEN", region:"UPR Nord-Est", lng:-1.451819142, lat:46.6655634, cellName:"ZOUFFTGEN_H2", techno:"4G", bande:"LTE1800", vendor:"ericsson", azimut:95, plaque:"DEPT_57", hba:37, zoneArcep:"top15", essentiel:"" },
  { siteId:"00000048L2", siteName:"ZOUFFTGEN", region:"UPR Nord-Est", lng:1.903830037, lat:47.91466932, cellName:"ZOUFFTGEN_F1", techno:"4G", bande:"LTE800", vendor:"ericsson", azimut:0, plaque:"DEPT_57", hba:37, zoneArcep:"top15", essentiel:"" },
  { siteId:"00000048L2", siteName:"ZOUFFTGEN", region:"UPR Nord-Est", lng:-2.424571988, lat:47.28219412, cellName:"ZOUFFTGEN_V3", techno:"4G", bande:"LTE2100", vendor:"ericsson", azimut:210, plaque:"DEPT_57", hba:37, zoneArcep:"top15", essentiel:"" },
  { siteId:"00000048L2", siteName:"ZOUFFTGEN", region:"UPR Nord-Est", lng:1.952549187, lat:47.90751034, cellName:"ZOUFFTGEN_V2", techno:"4G", bande:"LTE2100", vendor:"ericsson", azimut:95, plaque:"DEPT_57", hba:37, zoneArcep:"top15", essentiel:"" },
  { siteId:"00000048L2", siteName:"ZOUFFTGEN", region:"UPR Nord-Est", lng:2.358128545, lat:47.08260944, cellName:"ZOUFFTGEN_F2", techno:"4G", bande:"LTE800", vendor:"ericsson", azimut:95, plaque:"DEPT_57", hba:37, zoneArcep:"top15", essentiel:"" },
  { siteId:"00034775F5", siteName:"ZOTEUX", region:"UPR Nord-Est", lng:0.203331114, lat:49.5070874, cellName:"ZOTEUX_H1", techno:"4G", bande:"LTE1800", vendor:"ericsson", azimut:230, plaque:"DEPT_62", hba:36, zoneArcep:"", essentiel:"" },
  { siteId:"00034775F5", siteName:"ZOTEUX", region:"UPR Nord-Est", lng:1.918587984, lat:47.90082858, cellName:"ZOTEUX_X1", techno:"5G", bande:"NR_2100", vendor:"ericsson", azimut:230, plaque:"DEPT_62", hba:36, zoneArcep:"", essentiel:"" },
  { siteId:"00034775F5", siteName:"ZOTEUX", region:"UPR Nord-Est", lng:0.101928954, lat:49.48807064, cellName:"ZOTEUX_F1", techno:"4G", bande:"LTE800", vendor:"ericsson", azimut:230, plaque:"DEPT_62", hba:36, zoneArcep:"top15", essentiel:"" },
  { siteId:"00034775F5", siteName:"ZOTEUX", region:"UPR Nord-Est", lng:2.391556919, lat:47.05974869, cellName:"ZOTEUX_K1", techno:"4G", bande:"LTE700", vendor:"ericsson", azimut:230, plaque:"DEPT_62", hba:36, zoneArcep:"top15", essentiel:"" },
  { siteId:"00002444J5", siteName:"ZOO_DE_FREJUS", region:"UPR Sud-Est", lng:2.464316447, lat:47.09891381, cellName:"ZOO_DE_FREJUS_F1", techno:"4G", bande:"LTE800", vendor:"nokia", azimut:40, plaque:"FREJUS", hba:27, zoneArcep:"AXE", essentiel:"" },
  { siteId:"00002444J5", siteName:"ZOO_DE_FREJUS", region:"UPR Sud-Est", lng:1.116522867, lat:49.42625143, cellName:"ZOO_DE_FREJUS_V1", techno:"4G", bande:"LTE2100", vendor:"nokia", azimut:40, plaque:"FREJUS", hba:26, zoneArcep:"AXE", essentiel:"" },
  { siteId:"00002444J5", siteName:"ZOO_DE_FREJUS", region:"UPR Sud-Est", lng:2.37392484, lat:47.07154043, cellName:"ZOO_DE_FREJUS_F2", techno:"4G", bande:"LTE800", vendor:"nokia", azimut:225, plaque:"FREJUS", hba:27, zoneArcep:"AXE", essentiel:"" },
  { siteId:"00002444J5", siteName:"ZOO_DE_FREJUS", region:"UPR Sud-Est", lng:2.382909121, lat:47.10752102, cellName:"ZOO_DE_FREJUS_V2", techno:"4G", bande:"LTE2100", vendor:"nokia", azimut:225, plaque:"FREJUS", hba:26, zoneArcep:"AXE", essentiel:"" },
  { siteId:"00030671N1", siteName:"ZOO_BEAUVAL", region:"UPR Ouest", lng:-1.554304001, lat:48.7701698, cellName:"ZOO_BEAUVAL_K2", techno:"4G", bande:"LTE700", vendor:"nokia", azimut:170, plaque:"AUTRES41", hba:27, zoneArcep:"AXE", essentiel:"ARCEP" },
  { siteId:"00030671N1", siteName:"ZOO_BEAUVAL", region:"UPR Ouest", lng:0.165849943, lat:49.50655353, cellName:"ZOO_BEAUVAL_H3", techno:"4G", bande:"LTE1800", vendor:"nokia", azimut:260, plaque:"AUTRES41", hba:27, zoneArcep:"AXE", essentiel:"ARCEP" },
  { siteId:"00030671N1", siteName:"ZOO_BEAUVAL", region:"UPR Ouest", lng:2.388420127, lat:47.08349955, cellName:"ZOO_BEAUVAL_Y3", techno:"5G", bande:"NR_700", vendor:"nokia", azimut:260, plaque:"AUTRES41", hba:27, zoneArcep:"", essentiel:"" },
  { siteId:"00030671N1", siteName:"ZOO_BEAUVAL", region:"UPR Ouest", lng:2.423571039, lat:47.07524722, cellName:"ZOO_BEAUVAL_V2", techno:"4G", bande:"LTE2100", vendor:"nokia", azimut:170, plaque:"AUTRES41", hba:27, zoneArcep:"AXE", essentiel:"ARCEP" },
  { siteId:"00030671N1", siteName:"ZOO_BEAUVAL", region:"UPR Ouest", lng:1.162340613, lat:49.48536054, cellName:"ZOO_BEAUVAL_T1", techno:"5G", bande:"NR_3500", vendor:"nokia", azimut:80, plaque:"AUTRES41", hba:30, zoneArcep:"AXE", essentiel:"ARCEP" },
  { siteId:"00030671N1", siteName:"ZOO_BEAUVAL", region:"UPR Ouest", lng:1.1435468, lat:49.39248182, cellName:"ZOO_BEAUVAL_Y1", techno:"5G", bande:"NR_700", vendor:"nokia", azimut:80, plaque:"AUTRES41", hba:27, zoneArcep:"", essentiel:"" },
  { siteId:"00030671N1", siteName:"ZOO_BEAUVAL", region:"UPR Ouest", lng:2.421877696, lat:47.08698823, cellName:"ZOO_BEAUVAL_Y2", techno:"5G", bande:"NR_700", vendor:"nokia", azimut:170, plaque:"AUTRES41", hba:27, zoneArcep:"", essentiel:"" },
  { siteId:"00030671N1", siteName:"ZOO_BEAUVAL", region:"UPR Ouest", lng:0.704029282, lat:47.40480783, cellName:"ZOO_BEAUVAL_F1", techno:"4G", bande:"LTE800", vendor:"nokia", azimut:80, plaque:"AUTRES41", hba:27, zoneArcep:"AXE", essentiel:"ARCEP" },
  { siteId:"00030671N1", siteName:"ZOO_BEAUVAL", region:"UPR Ouest", lng:2.361016315, lat:47.06092854, cellName:"ZOO_BEAUVAL_T2", techno:"5G", bande:"NR_3500", vendor:"nokia", azimut:170, plaque:"AUTRES41", hba:30, zoneArcep:"AXE", essentiel:"ARCEP" },
  { siteId:"00030671N1", siteName:"ZOO_BEAUVAL", region:"UPR Ouest", lng:0.236574707, lat:49.41388682, cellName:"ZOO_BEAUVAL_K1", techno:"4G", bande:"LTE700", vendor:"nokia", azimut:80, plaque:"AUTRES41", hba:27, zoneArcep:"AXE", essentiel:"ARCEP" },
  { siteId:"00030671N1", siteName:"ZOO_BEAUVAL", region:"UPR Ouest", lng:0.271689693, lat:49.49539206, cellName:"ZOO_BEAUVAL_V3", techno:"4G", bande:"LTE2100", vendor:"nokia", azimut:260, plaque:"AUTRES41", hba:27, zoneArcep:"AXE", essentiel:"ARCEP" },
  { siteId:"00030671N1", siteName:"ZOO_BEAUVAL", region:"UPR Ouest", lng:-1.428892116, lat:46.34805352, cellName:"ZOO_BEAUVAL_K3", techno:"4G", bande:"LTE700", vendor:"nokia", azimut:260, plaque:"AUTRES41", hba:27, zoneArcep:"AXE", essentiel:"ARCEP" },
  { siteId:"00030671N1", siteName:"ZOO_BEAUVAL", region:"UPR Ouest", lng:-1.990534892, lat:46.73861379, cellName:"ZOO_BEAUVAL_T3", techno:"5G", bande:"NR_3500", vendor:"nokia", azimut:260, plaque:"AUTRES41", hba:30, zoneArcep:"AXE", essentiel:"ARCEP" },
  { siteId:"00030671N1", siteName:"ZOO_BEAUVAL", region:"UPR Ouest", lng:-2.057498156, lat:46.78888609, cellName:"ZOO_BEAUVAL_F3", techno:"4G", bande:"LTE800", vendor:"nokia", azimut:260, plaque:"AUTRES41", hba:27, zoneArcep:"AXE", essentiel:"ARCEP" },
  { siteId:"00030671N1", siteName:"ZOO_BEAUVAL", region:"UPR Ouest", lng:-2.269167471, lat:47.01138927, cellName:"ZOO_BEAUVAL_F2", techno:"4G", bande:"LTE800", vendor:"nokia", azimut:170, plaque:"AUTRES41", hba:27, zoneArcep:"AXE", essentiel:"ARCEP" },
  { siteId:"00030671N1", siteName:"ZOO_BEAUVAL", region:"UPR Ouest", lng:-1.810141098, lat:46.51358761, cellName:"ZOO_BEAUVAL_V1", techno:"4G", bande:"LTE2100", vendor:"nokia", azimut:80, plaque:"AUTRES41", hba:27, zoneArcep:"AXE", essentiel:"ARCEP" },
  { siteId:"00030671N1", siteName:"ZOO_BEAUVAL", region:"UPR Ouest", lng:1.863123318, lat:47.8594091, cellName:"ZOO_BEAUVAL_E3", techno:"4G", bande:"LTE2600", vendor:"nokia", azimut:260, plaque:"AUTRES41", hba:27, zoneArcep:"AXE", essentiel:"ARCEP" },
  { siteId:"00030671N1", siteName:"ZOO_BEAUVAL", region:"UPR Ouest", lng:1.884275716, lat:47.84247737, cellName:"ZOO_BEAUVAL_E1", techno:"4G", bande:"LTE2600", vendor:"nokia", azimut:80, plaque:"AUTRES41", hba:27, zoneArcep:"AXE", essentiel:"ARCEP" },
  { siteId:"00030671N1", siteName:"ZOO_BEAUVAL", region:"UPR Ouest", lng:1.162225588, lat:49.41225973, cellName:"ZOO_BEAUVAL_E2", techno:"4G", bande:"LTE2600", vendor:"nokia", azimut:170, plaque:"AUTRES41", hba:27, zoneArcep:"AXE", essentiel:"ARCEP" },
  { siteId:"00030671N1", siteName:"ZOO_BEAUVAL", region:"UPR Ouest", lng:-1.942226336, lat:46.69611395, cellName:"ZOO_BEAUVAL_H1", techno:"4G", bande:"LTE1800", vendor:"nokia", azimut:80, plaque:"AUTRES41", hba:27, zoneArcep:"AXE", essentiel:"ARCEP" },
  { siteId:"00030671N1", siteName:"ZOO_BEAUVAL", region:"UPR Ouest", lng:1.303046494, lat:47.60833201, cellName:"ZOO_BEAUVAL_H2", techno:"4G", bande:"LTE1800", vendor:"nokia", azimut:170, plaque:"AUTRES41", hba:27, zoneArcep:"AXE", essentiel:"ARCEP" },
  { siteId:"00018496B1", siteName:"ZIRIKOLATZ_BYT", region:"UPR Sud-Ouest", lng:1.323887416, lat:47.5833292, cellName:"ZIRIKOLATZ_BYT_Y2", techno:"5G", bande:"NR_700", vendor:"ericsson", azimut:140, plaque:"BAYONNE", hba:21, zoneArcep:"AXE", essentiel:"Sites stratégiques" },
  { siteId:"00018496B1", siteName:"ZIRIKOLATZ_BYT", region:"UPR Sud-Ouest", lng:1.043501634, lat:49.42172516, cellName:"ZIRIKOLATZ_BYT_Y3", techno:"5G", bande:"NR_700", vendor:"ericsson", azimut:240, plaque:"BAYONNE", hba:21, zoneArcep:"AXE", essentiel:"Sites stratégiques" },
  { siteId:"00018496B1", siteName:"ZIRIKOLATZ_BYT", region:"UPR Sud-Ouest", lng:1.139889392, lat:49.42475202, cellName:"ZIRIKOLATZ_BYT_Y1", techno:"5G", bande:"NR_700", vendor:"ericsson", azimut:0, plaque:"BAYONNE", hba:21, zoneArcep:"AXE", essentiel:"Sites stratégiques" },
  { siteId:"00018496B1", siteName:"ZIRIKOLATZ_BYT", region:"UPR Sud-Ouest", lng:2.379249026, lat:47.06065345, cellName:"ZIRIKOLATZ_BYT_T1", techno:"5G", bande:"NR_3500", vendor:"ericsson", azimut:0, plaque:"BAYONNE", hba:23, zoneArcep:"AXE", essentiel:"Sites stratégiques" },
  { siteId:"00018496B1", siteName:"ZIRIKOLATZ_BYT", region:"UPR Sud-Ouest", lng:1.075428388, lat:49.37906539, cellName:"ZIRIKOLATZ_BYT_F1", techno:"4G", bande:"LTE800", vendor:"ericsson", azimut:0, plaque:"BAYONNE", hba:21, zoneArcep:"AXE", essentiel:"" },
  { siteId:"00018496B1", siteName:"ZIRIKOLATZ_BYT", region:"UPR Sud-Ouest", lng:1.142224654, lat:49.48409392, cellName:"ZIRIKOLATZ_BYT_H1", techno:"4G", bande:"LTE1800", vendor:"ericsson", azimut:0, plaque:"BAYONNE", hba:21, zoneArcep:"AXE", essentiel:"" },
  { siteId:"00018496B1", siteName:"ZIRIKOLATZ_BYT", region:"UPR Sud-Ouest", lng:2.403572234, lat:47.11006581, cellName:"ZIRIKOLATZ_BYT_F3", techno:"4G", bande:"LTE800", vendor:"ericsson", azimut:240, plaque:"BAYONNE", hba:21, zoneArcep:"AXE", essentiel:"" },
  { siteId:"00018496B1", siteName:"ZIRIKOLATZ_BYT", region:"UPR Sud-Ouest", lng:-1.430519455, lat:46.67044812, cellName:"ZIRIKOLATZ_BYT_H3", techno:"4G", bande:"LTE1800", vendor:"ericsson", azimut:240, plaque:"BAYONNE", hba:21, zoneArcep:"AXE", essentiel:"" },
];

export default raw;
