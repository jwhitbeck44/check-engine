// Check Engine · every word a person sees lives in this file.
// Edit the text between the quotes. Keep the quotes, commas and brackets as they are.
// After an edit: bump ?v= on the content.js line in index.html so phones pick up the new file.
// No em dashes, please. Sentence case.
//
// EXAMPLE lines are written for one invented venture, "Ladle Patrol" (bike-delivered soup for
// night-shift nurses), the same one the class version uses. Nothing in them is real.

window.CONTENT = {
  title: "Check Engine",
  kicker: "Entrepreneurship for Everyone",

  // Top strip: the odometer
  odo: { version: "v", checks: "checks", none: "No checks yet" },

  rail: { start: "Start", build: "Build", numbers: "Numbers", dash: "Dashboard", road: "Road test" },

  start: {
    h1: "Will it run?",
    lede: "Sketch your venture on one page. Start the engine. The warning lights show where your plan argues with itself.",
    passLabel: "Passcode",
    passPh: "From whoever sent you here",
    passBad: "That passcode didn't work. Check it and try again.",
    passOk: "Passcode works.",
    nameLabel: "Venture name",
    namePh: "Call it something. You can change it.",
    aboutLabel: "One sentence about it",
    aboutPh: "What is it, and who is it for?",
    go: "Start building",
    saved: "Saves on this device as you type. No account.",
    steps: [
      "Build: nine blocks, fast and rough.",
      "Start the engine: read the lights.",
      "Fix a block. Start it again.",
    ],
  },

  build: {
    blockOf: "Block {n} of 9",
    ph: "One or two lines. Rough is fine.",
    showEx: "Show me an example",
    hideEx: "Hide the example",
    exLead: "Ladle Patrol says:", // EXAMPLE
    back: "Back",
    next: "Next block",
    toEngine: "Start the engine",
    skipNote: "Skip any block. Come back later.",
    tapNote: "Tap any block to jump to it.",
    changed: "changed",
  },

  // The nine blocks, in this order. short = the label inside the small canvas picture.
  blocks: [
    { id: "cs", name: "Customer Segments", nick: "The Tribe", short: "Tribe",
      q: "Who is this for? Be specific. \"Everyone\" is no one.",
      ex: "Night-shift nurses at two hospitals near campus. Dinner is a vending machine at 3 a.m." }, // EXAMPLE
    { id: "vp", name: "Value Propositions", nick: "The Fix", short: "Fix",
      q: "What pain do you kill, or what joy do you bring?",
      ex: "Hot homemade soup at 2 a.m., brought to the staff door. No app, no wait." }, // EXAMPLE
    { id: "ch", name: "Channels", nick: "The Distribution", short: "Distro",
      q: "How does it get into their hands? How do they hear about it?",
      ex: "A text line for orders, and a flyer on the break room fridge." }, // EXAMPLE
    { id: "cr", name: "Customer Relationships", nick: "The Vibe", short: "Vibe",
      q: "How do you treat your people? Self-serve, or you know them by name?",
      ex: "I know every regular by name. One group text a week with the menu." }, // EXAMPLE
    { id: "rs", name: "Revenue Streams", nick: "The Fuel", short: "Fuel",
      q: "How does money come in?",
      note: "Nonprofit, collective or research project? Read this as your funding mix.",
      ex: "$8 a bowl, or $30 for a five-bowl punch card." }, // EXAMPLE
    { id: "kr", name: "Key Resources", nick: "The Arsenal", short: "Arsenal",
      q: "What do you already have? Gear, skills, people, cash.",
      ex: "My roommate's giant pot, a bike with a cargo box, and my grandma's recipes." }, // EXAMPLE
    { id: "ka", name: "Key Activities", nick: "The Daily Grind", short: "Grind",
      q: "What do you have to do every week to make it work?",
      ex: "Cook at 9 p.m., take orders until midnight, ride at 2 a.m." }, // EXAMPLE
    { id: "kp", name: "Key Partnerships", nick: "The Co-Conspirators", short: "Co-Conspirators",
      q: "Who outside your team helps you pull it off?",
      ex: "A church kitchen that rents its stove by the hour. One charge nurse who spreads the word." }, // EXAMPLE
    { id: "co", name: "Cost Structure", nick: "The Burn", short: "Burn",
      q: "What does it cost to keep the lights on?",
      ex: "Kitchen rent $200 a month. About $2 a bowl for food and containers." }, // EXAMPLE
  ],

  numbers: {
    h2: "The numbers",
    lede: "Rough guesses are fine. The page does the math. Your pay counts as a cost, because a founder who works for free burns out.",
    reading: "Reading your canvas for numbers",
    foundNote: "We filled in what we found in your words. Fix anything that's wrong.",
    fromWords: "From your words:",
    reread: "Read my canvas again",
    rereadAsk: "Replace these numbers with what we find in your canvas now?",
    go: "Looks right. Start the engine",
    // The seven numbers. money = shown with a $ sign.
    fields: [
      { id: "price", label: "Price per sale (or average gift or grant)", money: true, ask: "What does one sale bring in?" },
      { id: "unit_cost", label: "Cost each time you make a sale (optional)", money: true, ask: "What does each sale cost you? Leave it blank if nothing." },
      { id: "sales", label: "Sales per month you expect", ask: "How many sales a month do you expect?" },
      { id: "monthly_cost", label: "Monthly cost to run it", money: true, ask: "What does it cost each month to run?" },
      { id: "pay", label: "What you need to be paid each month", money: true, ask: "What do you need to be paid each month?" },
      { id: "hours_per_sale", label: "Hours each sale takes you", ask: "About how many hours does one sale take you?" },
      { id: "hours_have", label: "Hours you have each month", ask: "How many hours a month can you give this?" },
    ],
    nan: "Numbers only, like 12 or 1,500.",
    neg: "Numbers here can't be negative.",
  },

  engine: {
    start: "Start the engine",
    again: "Start it again",
    checking: "Checking your canvas",
    needPass: "Add your passcode on the Start screen first.",
    empty: "Fill in a block or two first. There's nothing to check yet.",
  },

  // The seven warning lights, in order. a and b are block ids. Labels use the nicknames.
  pairs: [
    { a: "cs", b: "vp", q: "Would these people say this is their problem?" },
    { a: "ch", b: "cs", q: "Does this channel reach these people where they already are?" },
    { a: "rs", b: "cs", q: "Will these people pay this, this way?" },
    { a: "cr", b: "ka", q: "Does the way you treat people show up in the weekly work?" },
    { a: "ka", b: "kr", q: "Does the work need something you don't have?" },
    { a: "kp", b: "ka", q: "What happens the week your key partner says no?" },
    { a: "rs", b: "co", q: "Does The Fuel cover The Burn, with you getting paid?" },
  ],

  status: { holds: "Holds", shaky: "Shaky", breaks: "Breaks", cant_tell: "Can't tell yet" },

  dash: {
    h2: "Dashboard",
    // Headlines, built by the page from the lights
    red: ["1 red light.", "{n} red lights."],
    amber: ["1 amber light.", "{n} amber lights."],
    notEnough: "Not enough to start yet.",
    clear: "All clear as written.",
    standing: "No warning lights means your model agrees with itself. It can't tell you if customers exist. Go find out.",
    addMore: "Add more to:",
    addNumbers: "the numbers",
    tapLight: "Tap a light to see why.",
    fuel: "Fuel",
    fuelSub: "How much of The Burn The Fuel covers",
    fuelRead: "The Fuel covers {p} of The Burn.",
    fuelLoses: "Each sale costs more than it brings in.",
    salesNeed: "Sales needed: {need} a month",
    salesExpect: "You expect: {n}",
    salesNever: "Sales needed: no number works",
    temp: "Hours",
    tempSub: "Hours the needed sales take, against hours you have",
    tempRead: "Needs {need} hours a month. You have {have}.",
    hot: "Running hot",
    hotTick: "Hot",
    cool: "Cool",
    tankEmpty: "Empty",
    covered: "Covered",
    noRead: "Can't tell yet. Add the numbers.",
    fixNumbers: "Fix the numbers",
    fromCanvas: "From your canvas:",
    settle: "The question that settles it:",
    judgment: "Judgment call:",
    fromMoney: "From the money check.",
    fromHours: "From the hours check.",
    watch: "Watch this one first",
    watchShort: "watch first",
    assumeH: "What this rests on",
    assumeLede: "Riskiest first. Each has a cheap test you can run this week.",
    testLabel: "Test it:",
    changed: "Changed since the last check:",
    noChange: "Nothing changed since the last check.",
    toRoad: "Take it on a road test",
    toRoadClear: "Clear? Take it on a road test",
    route: "Now plan the route",
    routeNote: "Opens From Here to There. It plans the steps from here to your goal.",
    share: "Share",
    shared: "Link copied. Anyone with it sees a read-only copy.",
    shareFail: "Copy this link:",
    tooBig: "This link is long. Some apps cut long links.",
    none: "Start the engine to see your dashboard.",
    older: "Earlier checks",
    olderLine: "v{n} · {when} · {head}",
  },

  road: {
    h2: "Road test",
    lede: "Three things happen on the road. Which lights come on?",
    go: "Start the road test",
    again: "Run three new events",
    checking: "Driving it",
    survives: "Survives {n} of 3.",
    eventOk: "Survives",
    eventBad: "Breaks down",
    lightsOn: "Lights that come on:",
    noneOn: "No new lights.",
    hits: "Hits",
    watchTag: "Aimed at the one to watch",
    needDash: "Start the engine first. The road test uses your latest check.",
    baseRed: "Your dashboard already has red lights. The road test counts only new ones.",
    stale: "You changed the canvas since this road test. Run it again to test the new version.",
  },

  share: {
    viewTag: "Read-only copy",
    viewNote: "Someone shared this canvas with you. You can't change it here.",
    mine: "Make my own",
    bad: "This link is broken or cut off. Ask for it again.",
  },

  errors: {
    bad_passcode: "That passcode didn't work. Check it on the Start screen.",
    too_many_tries: "Too many wrong passcodes. Wait an hour and try again.",
    passcode_cap: "Your passcode hit today's limit. Try again tomorrow.",
    global_cap: "The tool hit today's limit for everyone. Try again tomorrow.",
    unreachable: "Can't reach the server. Check your connection and try again.",
    refused: "The check didn't run on this one. Try rewording a block.",
    too_long: "The check ran out of room. Try again.",
    upstream: "The check didn't finish. Try again.",
    bad_reply: "The check came back garbled. Try again.",
  },

  footer: "Saves on this device only. Your words go to Claude to run the check and aren't stored.",
  classLink: "In ENTP 3000? Use the class version",
  classUrl: "https://jwhitbeck44.github.io/bmc-game/",
  routeUrl: "https://jwhitbeck44.github.io/from-here-to-there/",
  forget: "Forget my passcode",
  reset: "Start over",
  resetAsk: "Erase this whole canvas from this device? This can't be undone.",
};
