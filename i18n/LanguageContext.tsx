import React, { createContext, useContext, useState } from 'react'

export type Language = 'en' | 'te' | 'hi'

const translations: Record<Language, Record<string, string>> = {
  en: {
    appName: 'APCity Prayaanam', appSub: 'APSRTC City Bus Tracker',
    byStops: 'By Stops', byRoute: 'By Route #',
    from: 'From (e.g. RTC Complex)', to: 'To (e.g. Rushikonda)',
    routeNo: 'Route Number (e.g. 900R, 38J)',
    today: 'Today', anyTime: 'Any time', passenger: '1 Passenger',
    searchBuses: 'SEARCH BUSES', myEPass: 'My ePass', liveBuses: 'Live Buses',
    myTickets: 'My Tickets', timetable: 'Timetable', recentSearches: 'Recent Searches',
    home: 'Home', buses: 'Buses', epass: 'ePass', profile: 'Profile',
    selectBus: 'Select Bus', allBusTypes: 'All Bus Types', allBuses: 'All Buses',
    availableSeats: 'Available Seats', express: 'Express', nightBus: 'Night Bus',
    running: 'Running', delayed: 'Delayed', atDepot: 'At Depot', breakdown: 'Breakdown',
    fleet: 'Fleet', vehicle: 'Vehicle', occupancy: 'Occupancy',
    liveRoute: 'Live Route', yourStop: 'YOUR STOP', busHere: 'BUS HERE', destination: 'DESTINATION',
    liveOccupancy: 'Live Occupancy', seatsLeft: 'seats free',
    fareBreakdown: 'Fare Breakdown', routeDistance: 'Route Distance',
    baseFare: 'Base Fare', reservationFee: 'Reservation Fee', totalFare: 'Total Est. Fare',
    bookGetPass: 'BOOK / GET PASS', myEPassTitle: 'My ePass', active: 'ACTIVE', pending: 'PENDING',
    selfReg: 'Self-Registration', noCounter: 'No Counter Visit Needed.',
    fullName: 'Full Name', asPerAadhaar: 'As per Aadhaar',
    aadhaar: 'Aadhaar (12 Digits)', mobile: 'Mobile (10 Digits)',
    passType: 'Pass Type', monthly: 'Monthly Pass', daily: 'Daily Pass',
    student: 'Student Pass', senior: 'Senior Citizen Pass',
    route: 'Route', cfmsId: 'CFMS / Student ID', orgName: 'Organization / College Name',
    payment: 'Payment Method', upiAutopay: 'UPI Autopay', upiOnetime: 'UPI One-time',
    netBanking: 'Net Banking', submitVerify: 'SUBMIT FOR VERIFICATION',
    verifyAadhaar: 'VERIFY AADHAAR & REGISTER', verifyNote: '24-Hour Online Verification',
    verifyDetail: 'Monthly passes require online verification. Your pass will be activated within 24 hours.',
    instantNote: 'Daily and Senior Citizen passes are issued instantly after Aadhaar verification.',
    busPasses: 'Bus Pass', scanQr: 'Scan QR to verify', savePass: 'SAVE / PRINT BUS PASS',
    fillMsg: 'Filling Up — Board at next stop', comfortMsg: 'Comfortable — Plenty of seats',
    fullMsg: 'Almost Full — Consider next bus', deptsIn: 'Departs in', expected: 'Expected at',
  },
  te: {
    appName: 'ఏపీసిటీ ప్రయాణం', appSub: 'ఏపీఎస్ఆర్టీసీ సిటీ బస్ ట్రాకర్',
    byStops: 'స్టాప్‌ల ద్వారా', byRoute: 'రూట్ నంబర్ ద్వారా',
    from: 'నుండి (ఉదా. RTC కాంప్లెక్స్)', to: 'వరకు (ఉదా. రుషికొండ)',
    routeNo: 'రూట్ నంబర్ (ఉదా. 900R, 38J)',
    today: 'ఈరోజు', anyTime: 'ఏ సమయమైనా', passenger: '1 ప్రయాణికుడు',
    searchBuses: 'బస్సులు వెతుకు', myEPass: 'నా ఈపాస్', liveBuses: 'లైవ్ బస్సులు',
    myTickets: 'నా టికెట్లు', timetable: 'సమయ పట్టిక', recentSearches: 'ఇటీవలి శోధనలు',
    home: 'హోమ్', buses: 'బస్సులు', epass: 'ఈపాస్', profile: 'ప్రొఫైల్',
    selectBus: 'బస్సు ఎంచుకోండి', allBusTypes: 'అన్ని బస్సు రకాలు', allBuses: 'అన్ని బస్సులు',
    availableSeats: 'అందుబాటులో ఉన్న సీట్లు', express: 'ఎక్స్‌ప్రెస్', nightBus: 'రాత్రి బస్',
    running: 'నడుస్తోంది', delayed: 'ఆలస్యం', atDepot: 'డిపోలో ఉంది', breakdown: 'విచ్ఛిన్నం',
    fleet: 'ఫ్లీట్', vehicle: 'వాహనం', occupancy: 'సీటు నింపడం',
    liveRoute: 'లైవ్ రూట్', yourStop: 'మీ స్టాప్', busHere: 'బస్ ఇక్కడ', destination: 'గమ్యం',
    liveOccupancy: 'లైవ్ సీటు నింపడం', seatsLeft: 'సీట్లు ఖాళీగా ఉన్నాయి',
    fareBreakdown: 'చార్జీల వివరాలు', routeDistance: 'రూట్ దూరం',
    baseFare: 'బేస్ చార్జీ', reservationFee: 'రిజర్వేషన్ రుసుము', totalFare: 'మొత్తం అంచనా చార్జీ',
    bookGetPass: 'బుక్ / పాస్ పొందండి', myEPassTitle: 'నా ఈపాస్', active: 'చురుకుగా ఉంది', pending: 'పెండింగ్',
    selfReg: 'స్వయం-నమోదు', noCounter: 'కౌంటర్ సందర్శన అవసరం లేదు.',
    fullName: 'పూర్తి పేరు', asPerAadhaar: 'ఆధార్ ప్రకారం',
    aadhaar: 'ఆధార్ (12 అంకెలు)', mobile: 'మొబైల్ (10 అంకెలు)',
    passType: 'పాస్ రకం', monthly: 'నెలవారీ పాస్', daily: 'రోజువారీ పాస్',
    student: 'విద్యార్థి పాస్', senior: 'సీనియర్ సిటిజన్ పాస్',
    route: 'రూట్', cfmsId: 'CFMS / విద్యార్థి ID', orgName: 'సంస్థ / కళాశాల పేరు',
    payment: 'చెల్లింపు పద్ధతి', upiAutopay: 'UPI ఆటోపే', upiOnetime: 'UPI ఒకసారి',
    netBanking: 'నెట్ బ్యాంకింగ్', submitVerify: 'ధృవీకరణకు సమర్పించు',
    verifyAadhaar: 'ఆధార్ ధృవీకరించి నమోదు చేయండి', verifyNote: '24 గంటల ఆన్‌లైన్ ధృవీకరణ',
    verifyDetail: 'నెలవారీ పాస్‌లకు ఆన్‌లైన్ ధృవీకరణ అవసరం. 24 గంటలలో సక్రియం అవుతుంది.',
    instantNote: 'రోజువారీ మరియు సీనియర్ సిటిజన్ పాస్‌లు వెంటనే జారీ చేయబడతాయి.',
    busPasses: 'బస్ పాస్', scanQr: 'ధృవీకరించడానికి QR స్కాన్ చేయండి', savePass: 'బస్ పాస్ సేవ్ / ప్రింట్ చేయండి',
    fillMsg: 'నిండుతోంది — తదుపరి స్టాప్‌లో ఎక్కండి', comfortMsg: 'సౌకర్యంగా ఉంది — చాలా సీట్లు ఉన్నాయి',
    fullMsg: 'దాదాపు నిండింది — తదుపరి బస్సు పరిగణించండి', deptsIn: 'బయలుదేరుతుంది', expected: 'అంచనా వేళ',
  },
  hi: {
    appName: 'एपीसिटी प्रयाणम', appSub: 'एपीएसआरटीसी सिटी बस ट्रैकर',
    byStops: 'स्टॉप से', byRoute: 'रूट नंबर से',
    from: 'से (जैसे RTC Complex)', to: 'तक (जैसे Rushikonda)',
    routeNo: 'रूट नंबर (जैसे 900R, 38J)',
    today: 'आज', anyTime: 'कभी भी', passenger: '1 यात्री',
    searchBuses: 'बसें खोजें', myEPass: 'मेरा ई-पास', liveBuses: 'लाइव बसें',
    myTickets: 'मेरे टिकट', timetable: 'समय सारिणी', recentSearches: 'हाल की खोजें',
    home: 'होम', buses: 'बसें', epass: 'ई-पास', profile: 'प्रोफ़ाइल',
    selectBus: 'बस चुनें', allBusTypes: 'सभी बस प्रकार', allBuses: 'सभी बसें',
    availableSeats: 'उपलब्ध सीटें', express: 'एक्सप्रेस', nightBus: 'रात की बस',
    running: 'चल रही है', delayed: 'देरी', atDepot: 'डिपो में', breakdown: 'खराबी',
    fleet: 'बेड़ा', vehicle: 'वाहन', occupancy: 'सीट भराव',
    liveRoute: 'लाइव रूट', yourStop: 'आपका स्टॉप', busHere: 'बस यहाँ', destination: 'गंतव्य',
    liveOccupancy: 'लाइव सीट भराव', seatsLeft: 'सीटें खाली',
    fareBreakdown: 'किराया विवरण', routeDistance: 'रूट दूरी',
    baseFare: 'आधार किराया', reservationFee: 'आरक्षण शुल्क', totalFare: 'कुल अनुमानित किराया',
    bookGetPass: 'बुक / पास प्राप्त करें', myEPassTitle: 'मेरा ई-पास', active: 'सक्रिय', pending: 'लंबित',
    selfReg: 'स्व-पंजीकरण', noCounter: 'काउंटर पर जाने की जरूरत नहीं।',
    fullName: 'पूरा नाम', asPerAadhaar: 'आधार के अनुसार',
    aadhaar: 'आधार (12 अंक)', mobile: 'मोबाइल (10 अंक)',
    passType: 'पास प्रकार', monthly: 'मासिक पास', daily: 'दैनिक पास',
    student: 'छात्र पास', senior: 'वरिष्ठ नागरिक पास',
    route: 'रूट', cfmsId: 'CFMS / छात्र ID', orgName: 'संगठन / कॉलेज का नाम',
    payment: 'भुगतान विधि', upiAutopay: 'UPI ऑटोपे', upiOnetime: 'UPI एक बार',
    netBanking: 'नेट बैंकिंग', submitVerify: 'सत्यापन के लिए जमा करें',
    verifyAadhaar: 'आधार सत्यापित करें और पंजीकरण करें', verifyNote: '24 घंटे ऑनलाइन सत्यापन',
    verifyDetail: 'मासिक पास के लिए ऑनलाइन सत्यापन आवश्यक है। 24 घंटे में सक्रिय होगा।',
    instantNote: 'दैनिक और वरिष्ठ नागरिक पास तुरंत जारी किए जाते हैं।',
    busPasses: 'बस पास', scanQr: 'QR स्कैन करें', savePass: 'बस पास सहेजें / प्रिंट करें',
    fillMsg: 'भर रही है — अगले स्टॉप पर चढ़ें', comfortMsg: 'आरामदायक — काफी सीटें हैं',
    fullMsg: 'लगभग भर गई — अगली बस लें', deptsIn: 'रवाना होगी', expected: 'अपेक्षित समय',
  }
}

interface LangCtx {
  lang: Language
  setLang: (l: Language) => void
  t: (key: string) => string
}

const LanguageContext = createContext<LangCtx>({
  lang: 'en', setLang: () => {}, t: (k) => k,
})

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>(() =>
    (localStorage.getItem('apcity-lang') as Language) || 'en'
  )
  const setLang = (l: Language) => { setLangState(l); localStorage.setItem('apcity-lang', l) }
  const t = (key: string) => translations[lang][key] || translations['en'][key] || key
  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export const useLang = () => useContext(LanguageContext)
