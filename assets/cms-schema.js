/* ============================================================
   Fairview Baptist Temple CMS - single source of truth for editable content.
   Used by content.js (live pages) and Studio so the
   two can never drift. Pure data, no dependencies. Sets a global.

   Field types:
     text     -> short text, set via textContent
     multiline-> long text (textarea in Studio), set via textContent
     rich     -> text where *word* becomes a teal accent <em>word</em>
     link     -> a URL, set on an <a href>
     image    -> a Storage URL shown in a photo slot (<img>)
     bg       -> a Storage URL used as a hero background photo
   The `key` is the row key in the site_content table. `def` is the
   current baked-in default (also what the live page already shows).
   ============================================================ */
window.FBT_SCHEMA = {
  // Grouped editable fields. Each entry: {key, label, type, def, hint?}
  groups: [
    {
      id: 'backgrounds',
      title: 'Page backgrounds',
      hint: 'Optional photo behind each page header. Leave empty to keep the teal gradient. A dark overlay is added automatically so text stays readable.',
      fields: [
        { key: 'hero_bg_home', label: 'Home hero background', type: 'bg', def: '' },
        { key: 'hero_bg_visit', label: 'Visit hero background', type: 'bg', def: '' },
        { key: 'hero_bg_beliefs', label: 'Beliefs hero background', type: 'bg', def: '' },
        { key: 'hero_bg_staff', label: 'Our Staff hero background', type: 'bg', def: '' },
        { key: 'hero_bg_getinvolved', label: 'Get Involved hero background', type: 'bg', def: '' },
        { key: 'hero_bg_nextsteps', label: 'Next Steps hero background', type: 'bg', def: '' },
        { key: 'hero_bg_prayer', label: 'Prayer hero background', type: 'bg', def: '' },
        { key: 'hero_bg_give', label: 'Give hero background', type: 'bg', def: '' },
        { key: 'hero_bg_live', label: 'The Overlook hero background', type: 'bg', def: '' },
        { key: 'hero_bg_messages', label: 'The Overlook Messages background', type: 'bg', def: '' },
        { key: 'hero_bg_music', label: 'The Overlook Music background', type: 'bg', def: '' },
        { key: 'hero_bg_blog', label: 'Blog hero background', type: 'bg', def: '' },
        { key: 'hero_bg_events', label: 'Events hero background', type: 'bg', def: '' },
        { key: 'hero_bg_missions', label: 'Missions hero background', type: 'bg', def: '' },
        { key: 'hero_bg_contact', label: 'Contact hero background', type: 'bg', def: '' },
      ],
    },
    {
      id: 'photos',
      title: 'Photos',
      hint: 'Original church photos are included where available. Replace a photo in Studio or choose a color background to hide it.',
      fields: [
        { key: 'photo_welcome', label: 'Home welcome photo', type: 'image', def: '/assets/photos/welcome.jpg' },
        {"key": "photo_visit", "label": "Visit welcome photo", "type": "image", "def": "/assets/photos/children-worship.jpg"},
        { key: 'photo_staff_group', label: 'Staff group photo', type: 'image', def: '' },
        {"key": "photo_gi_kids", "label": "Sunday School photo", "type": "image", "def": "/assets/photos/children-singing.jpg"},
        { key: 'photo_gi_youth', label: 'Get Involved: Youth Ministry photo', type: 'image', def: '' },
        { key: 'photo_gi_groups', label: 'Get Involved: H.O.P.E. Recovery photo', type: 'image', def: '' },
        { key: 'photo_gi_van', label: 'Get Involved: Van Ministry photo', type: 'image', def: '' },
        { key: 'photo_gi_menswomens', label: 'Get Involved: Soul-Winning Visitation photo', type: 'image', def: '' },
        {"key": "photo_gi_missions", "label": "Missions photo", "type": "image", "def": "/assets/photos/missions-message.jpg"},
        {"key": "photo_gi_music", "label": "Music and Choir photo", "type": "image", "def": "/assets/photos/childrens-choir.jpg"},
      ],
    },
    {
      id: 'staff',
      title: 'Staff',
      hint: 'Names, roles, bios and portraits for the Our Staff page.',
      fields: [
        {"key": "pastor_visible", "label": "Pastor Michael Spurlock visibility", "type": "text", "def": "show"},
        {"key": "pastor_name", "label": "Pastor Michael Spurlock name", "type": "text", "def": "Pastor Michael Spurlock"},
        {"key": "pastor_role", "label": "Pastor Michael Spurlock role", "type": "text", "def": "Pastor"},
        {"key": "pastor_bio", "label": "Pastor Michael Spurlock bio", "type": "multiline", "def": "Pastor Michael Spurlock began serving as pastor of Fairview Baptist Temple in the summer of 2024. With over eight years of full time ministry, his calling has been marked by a passion for souls, Bible centered preaching, and a heart to reach Clay County with the gospel of Jesus Christ. Before coming to Fairview he served at Mt. Pleasant Baptist Church in Elkview, WV and Hanes Baptist Church in Winston-Salem, NC. He holds a Bachelor's degree in Theology and a Master's in Biblical Exposition from Andersonville Theological Seminary."},
        {"key": "pastor_photo", "label": "Pastor Michael Spurlock portrait", "type": "image", "def": "/assets/staff/pastor-spurlock.webp"},
        {"key": "staff4_visible", "label": "Curt Moore visibility", "type": "text", "def": "show"},
        {"key": "staff4_name", "label": "Curt Moore name", "type": "text", "def": "Curt Moore"},
        {"key": "staff4_role", "label": "Curt Moore role", "type": "text", "def": "Head Deacon / H.O.P.E. Ministry Director"},
        {"key": "staff4_bio", "label": "Curt Moore bio", "type": "multiline", "def": ""},
        {"key": "staff4_photo", "label": "Curt Moore portrait", "type": "image", "def": "/assets/staff/curtis-moore.webp"},
        {"key": "staff7_visible", "label": "Jake Pierson visibility", "type": "text", "def": "show"},
        {"key": "staff7_name", "label": "Jake Pierson name", "type": "text", "def": "Jake Pierson"},
        {"key": "staff7_role", "label": "Jake Pierson role", "type": "text", "def": "Deacon / H.O.P.E. Ministry Assistant Director"},
        {"key": "staff7_bio", "label": "Jake Pierson bio", "type": "multiline", "def": ""},
        {"key": "staff7_photo", "label": "Jake Pierson portrait", "type": "image", "def": ""},
        {"key": "staff8_visible", "label": "Barry Payton visibility", "type": "text", "def": "show"},
        {"key": "staff8_name", "label": "Barry Payton name", "type": "text", "def": "Barry Payton"},
        {"key": "staff8_role", "label": "Barry Payton role", "type": "text", "def": "Deacon / Missions Director"},
        {"key": "staff8_bio", "label": "Barry Payton bio", "type": "multiline", "def": ""},
        {"key": "staff8_photo", "label": "Barry Payton portrait", "type": "image", "def": ""},
        {"key": "staff1_visible", "label": "Jamie Taylor visibility", "type": "text", "def": "show"},
        {"key": "staff1_name", "label": "Jamie Taylor name", "type": "text", "def": "Jamie Taylor"},
        {"key": "staff1_role", "label": "Jamie Taylor role", "type": "text", "def": "Trustee / Tech & Audio Director"},
        {"key": "staff1_bio", "label": "Jamie Taylor bio", "type": "multiline", "def": ""},
        {"key": "staff1_photo", "label": "Jamie Taylor portrait", "type": "image", "def": "/assets/staff/jamie-taylor.webp"},
        {"key": "staff2_visible", "label": "Robbie King visibility", "type": "text", "def": "show"},
        {"key": "staff2_name", "label": "Robbie King name", "type": "text", "def": "Robbie King"},
        {"key": "staff2_role", "label": "Robbie King role", "type": "text", "def": "Trustee / Custodian"},
        {"key": "staff2_bio", "label": "Robbie King bio", "type": "multiline", "def": ""},
        {"key": "staff2_photo", "label": "Robbie King portrait", "type": "image", "def": "/assets/staff/robbie-king.webp"},
        {"key": "staff5_visible", "label": "Joyce Legg visibility", "type": "text", "def": "show"},
        {"key": "staff5_name", "label": "Joyce Legg name", "type": "text", "def": "Joyce Legg"},
        {"key": "staff5_role", "label": "Joyce Legg role", "type": "text", "def": "Financial Secretary"},
        {"key": "staff5_bio", "label": "Joyce Legg bio", "type": "multiline", "def": ""},
        {"key": "staff5_photo", "label": "Joyce Legg portrait", "type": "image", "def": "/assets/staff/joyce-legg.webp"},
        {"key": "staff6_visible", "label": "Kris Moore visibility", "type": "text", "def": "show"},
        {"key": "staff6_name", "label": "Kris Moore name", "type": "text", "def": "Kris Moore"},
        {"key": "staff6_role", "label": "Kris Moore role", "type": "text", "def": "Administration Secretary / Sword Club Director"},
        {"key": "staff6_bio", "label": "Kris Moore bio", "type": "multiline", "def": ""},
        {"key": "staff6_photo", "label": "Kris Moore portrait", "type": "image", "def": "/assets/staff/kris-moore.webp"},
        {"key": "staff9_visible", "label": "Edna King visibility", "type": "text", "def": "show"},
        {"key": "staff9_name", "label": "Edna King name", "type": "text", "def": "Edna King"},
        {"key": "staff9_role", "label": "Edna King role", "type": "text", "def": "Custodian"},
        {"key": "staff9_bio", "label": "Edna King bio", "type": "multiline", "def": ""},
        {"key": "staff9_photo", "label": "Edna King portrait", "type": "image", "def": ""},
        {"key": "staff10_visible", "label": "Jennings & Nellie Elliott visibility", "type": "text", "def": "show"},
        {"key": "staff10_name", "label": "Jennings & Nellie Elliott name", "type": "text", "def": "Jennings & Nellie Elliott"},
        {"key": "staff10_role", "label": "Jennings & Nellie Elliott role", "type": "text", "def": "Teen Ministry Leaders"},
        {"key": "staff10_bio", "label": "Jennings & Nellie Elliott bio", "type": "multiline", "def": ""},
        {"key": "staff10_photo", "label": "Jennings & Nellie Elliott portrait", "type": "image", "def": ""},
      ],
    },
    {
      id: 'page_heroes',
      title: 'Page headlines',
      hint: 'The big text at the top of each page. Edit these inside Photos & media: open a page background and use "Text on this page". Wrap words in *asterisks* for the teal accent.',
      fields: [
        { key: 'home_hero_kick', label: 'Home: script line', type: 'text', def: 'Welcome home to' },
        { key: 'visit_hero_kick', label: 'Visit: script line', type: 'text', def: 'New to Fairview?' },
        { key: 'visit_hero_heading', label: 'Visit: headline', type: 'rich', def: 'Walking in somewhere new is *easier* than you think' },
        { key: 'visit_hero_sub', label: 'Visit: subtext', type: 'multiline', def: 'This page answers the questions folks usually have when they are looking for a church home. Come as you are. There is no pressure, and no spotlight on the new face in the room.' },
        { key: 'beliefs_hero_kick', label: 'Beliefs: script line', type: 'text', def: 'What we believe' },
        { key: 'beliefs_hero_heading', label: 'Beliefs: headline', type: 'rich', def: 'We take God at His *Word*' },
        { key: 'beliefs_hero_sub', label: 'Beliefs: subtext', type: 'multiline', def: 'Fairview Baptist Temple is an independent, fundamental Baptist church in Clay, West Virginia. We stand on the King James Bible, we preach the gospel of Jesus Christ, and we hold to the old paths without apology.' },
        { key: 'staff_hero_kick', label: 'Staff: script line', type: 'text', def: 'Our staff' },
        { key: 'staff_hero_heading', label: 'Staff: headline', type: 'rich', def: 'Come meet the church *family*' },
        { key: 'staff_hero_sub', label: 'Staff: subtext', type: 'multiline', def: 'There is no front desk between you and us. When you pull in off Main Street, real folks are glad to see you. Meet our pastor here, then come shake hands with the whole church family on Sunday.' },
        { key: 'getinvolved_hero_kick', label: 'Get Involved: script line', type: 'text', def: 'Get Involved' },
        { key: 'getinvolved_hero_heading', label: 'Get Involved: headline', type: 'rich', def: "There's a place *for you* here" },
        { key: 'getinvolved_hero_sub', label: 'Get Involved: subtext', type: 'multiline', def: 'Church is meant to be lived together. Whatever season you are in and whatever you carry, there is a place for you at Fairview and people ready to walk with you.' },
        { key: 'nextsteps_hero_kick', label: 'Next Steps: script line', type: 'text', def: 'Your Next Step' },
        { key: 'nextsteps_hero_heading', label: 'Next Steps: headline', type: 'rich', def: 'You do not have to take it *alone*' },
        { key: 'nextsteps_hero_sub', label: 'Next Steps: subtext', type: 'multiline', def: 'Whether you are wondering about salvation, ready to be baptized, looking for a church family, or simply need someone to talk with, there is a place to begin. Tell us where you are, and a real person from Fairview will walk with you.' },
        { key: 'events_hero_heading', label: 'Events: headline', type: 'rich', def: "What's happening at *Fairview*" },
        { key: 'events_hero_sub', label: 'Events: subtext', type: 'multiline', def: 'Revival meetings, homecoming Sundays, church fellowships, Vacation Bible School, and special services. There is always a seat for you here.' },
        { key: 'missions_hero_heading', label: 'Missions: headline', type: 'rich', def: 'Beyond these *hills*' },
        { key: 'missions_hero_sub', label: 'Missions: subtext', type: 'multiline', def: 'Praying for and supporting missionaries from the hills of Clay County unto the uttermost part of the earth. Acts 1:8, KJV.' },
        { key: 'give_hero_kick', label: 'Give: script line', type: 'text', def: 'Give' },
        { key: 'give_hero_heading', label: 'Give: headline', type: 'rich', def: 'Tithes and offerings are *worship*' },
        { key: 'give_hero_sub', label: 'Give: subtext', type: 'multiline', def: 'At Fairview Baptist Temple we bring our tithes and offerings to the Lord with grateful hearts, as part of our worship. Thank you for having a part in carrying the gospel through Clay County and far beyond these hills.' },
        { key: 'contact_hero_kick', label: 'Contact: script line', type: 'text', def: 'Contact' },
        { key: 'contact_hero_heading', label: 'Contact: headline', type: 'rich', def: 'We would *love* to hear from you' },
        { key: 'contact_hero_sub', label: 'Contact: subtext', type: 'multiline', def: 'The best way to reach us is a phone call. Have a question, need a ride to church, or want help planning your first visit? Call 304-587-4709 and a real person will help you out.' },
      ],
    },
    {
      id: 'design',
      title: 'Design: fonts & colors',
      hint: 'Optional site-wide look changes. Blank = the standard Fairview design.',
      fields: [
        { key: 'style_heading_font', label: 'Heading font (montserrat, oswald, archivo, bebas)', type: 'text', def: '' },
        { key: 'style_script_font', label: 'Script accent font (delafield, greatvibes, dancing, allura)', type: 'text', def: '' },
        { key: 'style_accent_color', label: 'Accent color (hex)', type: 'text', def: '' },
        { key: 'style_heading_color', label: 'Heading color (hex)', type: 'text', def: '' },
      ],
    },
    {
      id: 'text',
      title: 'Headlines & copy',
      hint: 'Wrap words in *asterisks* to make them the teal accent line, e.g. Fairview *Baptist Temple*.',
      fields: [
        { key: 'home_hero_heading', label: 'Home hero headline', type: 'rich', def: 'Fairview *Baptist Temple*' },
        { key: 'home_hero_sub', label: 'Home hero subtext', type: 'multiline', def: 'An independent Baptist church on Main Street in Clay, West Virginia. Old fashioned singing, preaching from the King James Bible, and a seat saved for you this Sunday.' },
        { key: 'home_welcome_heading', label: 'Home welcome heading', type: 'text', def: 'A church family in the hills' },
        { key: 'home_welcome_kick', label: 'Home welcome script line', type: 'text', def: 'Welcome home to Fairview' },
        { key: 'home_stream_kick', label: 'Home Overlook script line', type: 'text', def: 'The Overlook' },
        { key: 'home_stream_heading', label: 'Home Overlook heading', type: 'rich', def: 'Catch the latest message' },
        { key: 'home_stream_sub', label: 'Home Overlook paragraph', type: 'multiline', def: 'Join us live on Sundays, or stream any past service and the singing from our church family, anytime and free.' },
        { key: 'home_missions_cta', label: 'Home missions button', type: 'text', def: 'Explore the map' },
        { key: 'home_contact_kick', label: 'Home visit script line', type: 'text', def: "We'd love to meet you" },
        { key: 'home_contact_heading', label: 'Home visit heading', type: 'rich', def: 'Come visit us *this Sunday.*' },
        { key: 'hope_band_heading', label: 'Home H.O.P.E. band headline', type: 'rich', def: 'Fighting addiction? There is H.O.P.E.' },
        { key: 'hope_band_sub', label: 'Home H.O.P.E. band paragraph', type: 'multiline', def: 'A Christ centered recovery program that meets Friday evenings at the church. No judgment, just the gospel and people who care. Our van will even come get you. Call 304-587-4709.' },
        { key: 'hope_band_cta', label: 'Home H.O.P.E. band button', type: 'text', def: 'Learn about H.O.P.E.' },
        { key: 'home_missions_kick', label: 'Home missions script line', type: 'text', def: 'Beyond the hills' },
        { key: 'home_missions_heading', label: 'Home missions heading', type: 'rich', def: 'Our reach around the *world*' },
        { key: 'home_missions_sub', label: 'Home missions paragraph', type: 'multiline', def: 'Fairview keeps a strong missions program, sending and supporting missionaries carrying the gospel far beyond Clay County. Explore where they serve and pray with them.' },
        { key: 'tile_new_title', label: 'Home tile 1 title', type: 'text', def: 'I\'m New' },
        { key: 'tile_new_sub', label: 'Home tile 1 subtitle', type: 'text', def: 'Plan your first visit' },
        { key: 'tile_overlook_title', label: 'Home tile 2 title', type: 'text', def: 'The Overlook' },
        { key: 'tile_overlook_sub', label: 'Home tile 2 subtitle', type: 'text', def: 'Watch live and past messages' },
        { key: 'tile_ministries_title', label: 'Home tile 3 title', type: 'text', def: 'Ministries' },
        { key: 'tile_ministries_sub', label: 'Home tile 3 subtitle', type: 'text', def: 'H.O.P.E. · Van · Youth · Missions' },
        { key: 'home_welcome_body', label: 'Home welcome paragraph', type: 'multiline', def: 'We are a church family in the hills of Clay County that believes the Bible, loves people, and preaches Christ crucified, buried, and risen again. However you come and whatever you carry, you will find a warm welcome, honest preaching, and a place to belong.' },
        { key: 'beliefs_faith', label: 'Beliefs: Our Faith', type: 'multiline', def: 'We are an independent, fundamental Baptist church that stands on the King James Bible as the preserved Word of God, cherishing its unchanging truths without compromise.' },
        { key: 'beliefs_purpose', label: 'Beliefs: Our Purpose', type: 'multiline', def: 'Sharing the message of salvation through Jesus Christ, we nurture faith, build strong families, and reach our community and the world with the gospel.' },
        { key: 'beliefs_calling', label: 'Beliefs: Our Calling', type: 'multiline', def: "Called to worship and serve in spirit and truth, we are a refuge for the hurting, a help for the struggling, and a beacon of God's Word in Clay County." },
        { key: 'beliefs_hope', label: 'Beliefs: Our Hope', type: 'multiline', def: 'The Bible teaches that all have sinned and are in need of salvation. Jesus loves you and has made a way for you to be saved. Accept His gift of grace today.' },
      ],
    },
    {
      id: 'facts',
      title: 'Facts & service times',
      hint: 'These update everywhere they appear on the site.',
      fields: [
        { key: 'contact_address', label: 'Street address', type: 'text', def: '2294 Main Street' },
        { key: 'contact_city', label: 'City, state ZIP', type: 'text', def: 'Clay, WV 25043' },
        { key: 'contact_phone', label: 'Phone', type: 'text', def: '304-587-4709' },
        { key: 'contact_email', label: 'Email', type: 'text', def: '[Church email address]' },
        { key: 'time_sunday_school', label: 'Sunday School time', type: 'text', def: '10:00am' },
        { key: 'time_worship', label: 'Worship time', type: 'text', def: '11:00am' },
        { key: 'time_evening', label: 'Sunday evening time', type: 'text', def: '6:00pm' },
        { key: 'time_midweek', label: 'Midweek (Wednesday) time', type: 'text', def: '7:00pm' },
      ],
    },
    {
      id: 'links',
      title: 'Links',
      hint: 'Paste full URLs that start with https://. Leave a field blank to keep the site\'s built-in link.',
      fields: [
        { key: 'give_link', label: 'Online giving link (Anedot)', type: 'link', def: 'https://secure.anedot.com/fairview-baptist-temple/give' },



        { key: 'youtube_url', label: 'YouTube channel URL', type: 'link', def: 'https://www.youtube.com/@FairviewBaptistTemple' },
        { key: 'facebook_url', label: 'Facebook URL', type: 'link', def: 'https://www.facebook.com/FairviewBaptistTemple' },
        { key: 'instagram_url', label: 'Instagram URL', type: 'link', def: 'https://www.instagram.com/fairviewbaptisttemple' },
        {"key": "tiktok_url", "label": "Tiktok url", "type": "link", "def": "https://www.tiktok.com/@fairviewbaptisttemple"},
        { key: 'live_channel_id', label: 'YouTube channel ID for live embed (starts with UC...)', type: 'text', def: '' },
      ],
    },
  ],

  // Sermons live in their own table and are organized in Studio.
  sermonFields: [
    { key: 'title', label: 'Title', type: 'text' },
    { key: 'series', label: 'Series', type: 'text' },
    { key: 'book', label: 'Bible book', type: 'book' },
    { key: 'reference', label: 'Scripture reference', type: 'text' },
    { key: 'topics', label: 'Topics / subjects', type: 'tags' },
    { key: 'speaker', label: 'Speaker', type: 'text', def: 'Pastor Michael Spurlock' },
    { key: 'preached_on', label: 'Date preached', type: 'date' },
    { key: 'video_url', label: 'Video / listen link', type: 'link' },
    { key: 'thumb_url', label: 'Thumbnail image', type: 'image' },
    { key: 'featured', label: 'Show as the featured (latest) message', type: 'bool' },
  ],

  // The 66 books of the Bible, in order (for the sermon Book dropdown + scripture sorting).
  books: [
    'Genesis','Exodus','Leviticus','Numbers','Deuteronomy','Joshua','Judges','Ruth',
    '1 Samuel','2 Samuel','1 Kings','2 Kings','1 Chronicles','2 Chronicles','Ezra','Nehemiah',
    'Esther','Job','Psalms','Proverbs','Ecclesiastes','Song of Solomon','Isaiah','Jeremiah',
    'Lamentations','Ezekiel','Daniel','Hosea','Joel','Amos','Obadiah','Jonah','Micah','Nahum',
    'Habakkuk','Zephaniah','Haggai','Zechariah','Malachi','Matthew','Mark','Luke','John','Acts',
    'Romans','1 Corinthians','2 Corinthians','Galatians','Ephesians','Philippians','Colossians',
    '1 Thessalonians','2 Thessalonians','1 Timothy','2 Timothy','Titus','Philemon','Hebrews',
    'James','1 Peter','2 Peter','1 John','2 John','3 John','Jude','Revelation',
  ],

  // Suggested subjects (the church can type any others too).
  topicsSuggested: [
    'Salvation','Faith','Prayer','Grace','Hope','Love','Family','Marriage','Forgiveness',
    'Worship','Discipleship','The Gospel','Holiness','Suffering','Heaven','Stewardship',
    'Evangelism','The Church','Holy Spirit','Repentance',
  ],
};

// Additional page content shares its defaults with the public site and Studio.
window.FBT_SCHEMA.groups.push({
  "id": "page_updates",
  "title": "Church life and ministry details",
  "fields": [
    {
      "key": "hero_bg_welcome_home",
      "label": "Home welcome background",
      "type": "bg",
      "def": "/assets/photos/welcome.jpg"
    },
    {
      "key": "photo_home_preaching",
      "label": "Home preaching photo",
      "type": "image",
      "def": "/assets/photos/preaching.jpg"
    },
    {
      "key": "photo_home_bible",
      "label": "Home Bible photo",
      "type": "image",
      "def": "/assets/photos/bible-in-worship.jpg"
    },
    {
      "key": "photo_home_worship",
      "label": "Home worship photo",
      "type": "image",
      "def": "/assets/photos/worship.jpg"
    },
    {
      "key": "photo_missions_team",
      "label": "Missions team photo",
      "type": "image",
      "def": "/assets/photos/missions-gathering.jpg"
    },
    {
      "key": "photo_nextsteps_baptism",
      "label": "Next Steps baptism photo",
      "type": "image",
      "def": "/assets/photos/baptism.jpg"
    },
    {
      "key": "hero_bg_home_family",
      "label": "Home church family section background",
      "type": "bg",
      "def": ""
    },
    {
      "key": "hero_bg_missions_s3",
      "label": "Missions team section background",
      "type": "bg",
      "def": ""
    },
    {
      "key": "home_family_kick",
      "label": "Home family kick",
      "type": "text",
      "def": "Life at Fairview"
    },
    {
      "key": "home_family_heading",
      "label": "Home family heading",
      "type": "rich",
      "def": "Gathered around the *Word*"
    },
    {
      "key": "home_family_sub",
      "label": "Home family sub",
      "type": "multiline",
      "def": "Preaching, singing, and worship with our church family in Clay."
    },
    {
      "key": "visit_nursery_heading",
      "label": "Visit nursery heading",
      "type": "multiline",
      "def": "Nursery care"
    },
    {
      "key": "visit_nursery_body",
      "label": "Visit nursery body",
      "type": "multiline",
      "def": "A nursery is available for younger children so parents can enjoy the service. Our workers are warm, fun, and caring. Ask at the door and we will help your family get settled."
    },
    {
      "key": "visit_faq_kids",
      "label": "Visit faq kids",
      "type": "multiline",
      "def": "A nursery is available for younger children so parents can enjoy the service. Our nursery workers are warm, fun, and caring. Sunday School has Bible classes for all ages at 10:00am, and our youth ministry gives young people a place to grow in the Lord. Ask at the door and we will help your family get settled."
    },
    {
      "key": "visit_kids_arrival",
      "label": "Visit kids arrival",
      "type": "multiline",
      "def": "Sunday School has Bible classes for every age at 10:00am. For younger children, our nursery workers will help them settle in so you can enjoy the service. We will point your family to the right place."
    },
    {
      "key": "missions_s1_sub",
      "label": "Missions s1 sub",
      "type": "multiline",
      "def": "Our church prays for and supports missionaries carrying the gospel around the world. Explore the map and learn about the people and places we are praying for."
    },
    {
      "key": "missions_s3_kick",
      "label": "Missions s3 kick",
      "type": "multiline",
      "def": "Our missions team"
    },
    {
      "key": "missions_s3_heading",
      "label": "Missions s3 heading",
      "type": "rich",
      "def": "Serve here. *Reach the world.*"
    },
    {
      "key": "missions_s3_sub",
      "label": "Missions s3 sub",
      "type": "multiline",
      "def": "Our missions team corresponds with missionaries, finds ways to share the gospel in our own community, and meets periodically to discuss our missionaries' needs and how we can support and help them."
    },
    {
      "key": "missions_team_contact",
      "label": "Missions team contact",
      "type": "multiline",
      "def": "Interested in getting involved? Barry Payton, our Missions Director, can help you find a place to serve. Contact the church and ask about the missions team."
    },
    {
      "key": "missions_team_cta",
      "label": "Missions team cta",
      "type": "multiline",
      "def": "Ask about the missions team"
    },
    {
      "key": "gi_missions_leader",
      "label": "Gi missions leader",
      "type": "multiline",
      "def": "Barry Payton, Missions Director"
    }
  ]
});
window.FBT_SCHEMA.mediaSlots = [
  {
    "key": "hero_bg_home_family",
    "label": "Home: life at Fairview",
    "page": "/",
    "pageLabel": "Home page",
    "kind": "background",
    "ratio": "hero-page",
    "backdrop": "#FAF6ED",
    "textKeys": [
      "home_family_kick",
      "home_family_heading",
      "home_family_sub"
    ]
  },
  {
    "key": "hero_bg_missions_s3",
    "label": "Missions: our missions team",
    "page": "/missions",
    "pageLabel": "Missions page",
    "kind": "background",
    "ratio": "hero-page",
    "backdrop": "#FAF6ED",
    "textKeys": [
      "missions_s3_kick",
      "missions_s3_heading",
      "missions_s3_sub",
      "missions_team_contact",
      "missions_team_cta"
    ]
  },
  {
    "key": "hero_bg_visit_s2",
    "textKeys": [
      "visit_kids_arrival"
    ]
  },
  {
    "key": "hero_bg_visit_s3",
    "textKeys": [
      "visit_nursery_heading",
      "visit_nursery_body"
    ]
  },
  {
    "key": "hero_bg_visit_s5",
    "textKeys": [
      "visit_faq_kids"
    ]
  },
  {
    "key": "photo_home_preaching",
    "label": "Home: preaching",
    "page": "/",
    "pageLabel": "Home page",
    "kind": "photo",
    "ratio": "landscape"
  },
  {
    "key": "photo_home_bible",
    "label": "Home: the Word of God",
    "page": "/",
    "pageLabel": "Home page",
    "kind": "photo",
    "ratio": "landscape"
  },
  {
    "key": "photo_home_worship",
    "label": "Home: worship",
    "page": "/",
    "pageLabel": "Home page",
    "kind": "photo",
    "ratio": "landscape"
  },
  {
    "key": "photo_missions_team",
    "label": "Missions: team photo",
    "page": "/missions",
    "pageLabel": "Missions page",
    "kind": "photo",
    "ratio": "four-three"
  },
  {
    "key": "photo_nextsteps_baptism",
    "label": "Next Steps: baptism",
    "page": "/next-steps",
    "pageLabel": "Next Steps page",
    "kind": "photo",
    "ratio": "landscape"
  }
];

window.FBT_SCHEMA.groups.push({
  "id": "jubilee",
  "title": "Appalachian Jubilee",
  "fields": [
    {
      "key": "jubilee_hero_kick",
      "type": "text",
      "label": "Hero Script line",
      "def": "Fairview Baptist Temple · Clay, West Virginia",
      "studioSection": "Mountain hero"
    },
    {
      "key": "jubilee_hero_heading",
      "type": "rich",
      "label": "Hero Heading",
      "def": "The Appalachian *Jubilee*",
      "studioSection": "Mountain hero"
    },
    {
      "key": "jubilee_hero_sub",
      "type": "multiline",
      "label": "Hero Paragraph",
      "def": "Five days of preaching, music, and fellowship in the hills of West Virginia.",
      "studioSection": "Mountain hero"
    },
    {
      "key": "jubilee_dates",
      "type": "text",
      "label": "Dates",
      "def": "November 14-18, 2026",
      "studioSection": "Mountain hero"
    },
    {
      "key": "jubilee_start_date",
      "type": "date",
      "label": "Event start date for search",
      "def": "2026-11-14",
      "studioSection": "Mountain hero"
    },
    {
      "key": "jubilee_end_date",
      "type": "date",
      "label": "Event final date for search",
      "def": "2026-11-18",
      "studioSection": "Mountain hero"
    },
    {
      "key": "jubilee_host",
      "type": "text",
      "label": "Host",
      "def": "Michael Spurlock, Host Pastor",
      "studioSection": "Event introduction"
    },
    {
      "key": "jubilee_intro_kick",
      "type": "text",
      "label": "Introduction script line",
      "def": "November 14-18, 2026",
      "studioSection": "Event introduction"
    },
    {
      "key": "jubilee_intro_heading",
      "type": "rich",
      "label": "Introduction heading",
      "def": "The Appalachian *Jubilee*",
      "studioSection": "Event introduction"
    },
    {
      "key": "jubilee_intro_copy",
      "type": "multiline",
      "label": "Introduction paragraph",
      "def": "Join us at Fairview Baptist Temple in Clay, West Virginia, for five days of preaching, choir, and special singing. Come for a service or make plans to stay for the week.",
      "studioSection": "Event introduction"
    },
    {
      "key": "jubilee_schedule_heading",
      "type": "text",
      "label": "Schedule Heading",
      "def": "Services and guest speakers",
      "studioSection": "Service schedule"
    },
    {
      "key": "jubilee_schedule_sub",
      "type": "multiline",
      "label": "Schedule introduction",
      "def": "Join us Saturday through Wednesday. All service times are Eastern.",
      "studioSection": "Service schedule"
    },
    {
      "key": "jubilee_sat_day",
      "type": "text",
      "label": "Sat Day",
      "def": "Saturday, November 14",
      "studioSection": "Service schedule"
    },
    {
      "key": "jubilee_sat_time",
      "type": "text",
      "label": "Sat Time",
      "def": "10:00am",
      "studioSection": "Service schedule"
    },
    {
      "key": "jubilee_sat_speakers",
      "type": "text",
      "label": "Sat Speakers",
      "def": "Brandon Stone",
      "studioSection": "Service schedule"
    },
    {
      "key": "jubilee_sun_day",
      "type": "text",
      "label": "Sun Day",
      "def": "Sunday, November 15",
      "studioSection": "Service schedule"
    },
    {
      "key": "jubilee_sun_time",
      "type": "text",
      "label": "Sun Time",
      "def": "10:00am, 11:00am & 6:00pm",
      "studioSection": "Service schedule"
    },
    {
      "key": "jubilee_sun_speakers",
      "type": "text",
      "label": "Sun Speakers",
      "def": "Travis Groves and Jason Holley",
      "studioSection": "Service schedule"
    },
    {
      "key": "jubilee_mon_day",
      "type": "text",
      "label": "Mon Day",
      "def": "Monday, November 16",
      "studioSection": "Service schedule"
    },
    {
      "key": "jubilee_mon_time",
      "type": "text",
      "label": "Mon Time",
      "def": "7:00pm",
      "studioSection": "Service schedule"
    },
    {
      "key": "jubilee_mon_speakers",
      "type": "text",
      "label": "Mon Speakers",
      "def": "Brandon Stone and Scott Matthews",
      "studioSection": "Service schedule"
    },
    {
      "key": "jubilee_tue_day",
      "type": "text",
      "label": "Tue Day",
      "def": "Tuesday, November 17",
      "studioSection": "Service schedule"
    },
    {
      "key": "jubilee_tue_time",
      "type": "text",
      "label": "Tue Time",
      "def": "7:00pm",
      "studioSection": "Service schedule"
    },
    {
      "key": "jubilee_tue_speakers",
      "type": "text",
      "label": "Tue Speakers",
      "def": "Jason Holley and David King",
      "studioSection": "Service schedule"
    },
    {
      "key": "jubilee_wed_day",
      "type": "text",
      "label": "Wed Day",
      "def": "Wednesday, November 18",
      "studioSection": "Service schedule"
    },
    {
      "key": "jubilee_wed_time",
      "type": "text",
      "label": "Wed Time",
      "def": "7:00pm",
      "studioSection": "Service schedule"
    },
    {
      "key": "jubilee_wed_speakers",
      "type": "text",
      "label": "Wed Speakers",
      "def": "Scott Matthews and Preston Milan",
      "studioSection": "Service schedule"
    },
    {
      "key": "jubilee_music_kick",
      "type": "text",
      "label": "Music section script line",
      "def": "Come hear them sing",
      "studioSection": "Choir and special singing"
    },
    {
      "key": "jubilee_music_heading",
      "type": "text",
      "label": "Music Heading",
      "def": "Choir and special singing",
      "studioSection": "Choir and special singing"
    },
    {
      "key": "jubilee_music_copy",
      "type": "multiline",
      "label": "Music Copy",
      "def": "Choir and special singing nightly with Kathy Spurlock, Brandon Stone, Tiffani Holley, The Matthews Family, and more.",
      "studioSection": "Choir and special singing"
    },
    {
      "key": "jubilee_watch_copy",
      "type": "multiline",
      "label": "Watch Copy",
      "def": "Watch live on Facebook and YouTube.",
      "studioSection": "Service schedule"
    },
    {
      "key": "jubilee_music_family_dates",
      "type": "text",
      "label": "The Matthews Family dates",
      "def": "The Matthews Family · Monday-Wednesday, November 16-18",
      "studioSection": "Choir and special singing"
    },
    {
      "key": "jubilee_s1_kick",
      "type": "text",
      "label": "Plan your visit Script line",
      "def": "Come be with us",
      "studioSection": "Plan your visit and stay"
    },
    {
      "key": "jubilee_s1_heading",
      "type": "rich",
      "label": "Plan your visit Heading",
      "def": "Make plans to *join us*",
      "studioSection": "Plan your visit and stay"
    },
    {
      "key": "jubilee_s1_sub",
      "type": "multiline",
      "label": "Plan your visit Paragraph",
      "def": "Spend the week with us or join us for a service. If you need help planning your visit or finding your way to Fairview, get in touch with the church.",
      "studioSection": "Plan your visit and stay"
    },
    {
      "key": "jubilee_s2_kick",
      "type": "text",
      "label": "Lodging section Script line",
      "def": "Stay a little while",
      "studioSection": "Plan your visit and stay"
    },
    {
      "key": "jubilee_s2_heading",
      "type": "rich",
      "label": "Lodging section Heading",
      "def": "Places to *stay*",
      "studioSection": "Plan your visit and stay"
    },
    {
      "key": "jubilee_s2_sub",
      "type": "multiline",
      "label": "Lodging section Paragraph",
      "def": "Coming from out of town? Here are hotel options in Sutton, Elkview, and the Mink Shoals area, along with cabins at Walker Creek Farms in Nebo.",
      "studioSection": "Plan your visit and stay"
    },
    {
      "key": "jubilee_lodging_sutton_area",
      "type": "text",
      "label": "Lodging Sutton Area",
      "def": "Sutton",
      "studioSection": "Plan your visit and stay"
    },
    {
      "key": "jubilee_lodging_sutton_name",
      "type": "text",
      "label": "Lodging Sutton Name",
      "def": "Days Inn & Suites by Wyndham Sutton Flatwoods",
      "studioSection": "Plan your visit and stay"
    },
    {
      "key": "jubilee_lodging_sutton_copy",
      "type": "multiline",
      "label": "Lodging Sutton Copy",
      "def": "Hotel accommodations at 350 Days Drive in Sutton, with access to I-79.",
      "studioSection": "Plan your visit and stay"
    },
    {
      "key": "jubilee_lodging_sutton_url",
      "type": "link",
      "label": "Lodging Sutton URL",
      "def": "https://www.wyndhamhotels.com/days-inn/sutton-west-virginia/days-hotel-sutton-flatwoods/overview",
      "studioSection": "Plan your visit and stay"
    },
    {
      "key": "jubilee_lodging_elkview_area",
      "type": "text",
      "label": "Lodging Elkview Area",
      "def": "Elkview",
      "studioSection": "Plan your visit and stay"
    },
    {
      "key": "jubilee_lodging_elkview_name",
      "type": "text",
      "label": "Lodging Elkview Name",
      "def": "La Quinta Inn & Suites by Wyndham Elkview - Charleston NE",
      "studioSection": "Plan your visit and stay"
    },
    {
      "key": "jubilee_lodging_elkview_copy",
      "type": "multiline",
      "label": "Lodging Elkview Copy",
      "def": "Hotel accommodations at 101 Crossings Mall Road in Elkview, off I-79.",
      "studioSection": "Plan your visit and stay"
    },
    {
      "key": "jubilee_lodging_elkview_url",
      "type": "link",
      "label": "Lodging Elkview URL",
      "def": "https://www.wyndhamhotels.com/laquinta/elkview-west-virginia/la-quinta-elkview-charleston-ne/overview",
      "studioSection": "Plan your visit and stay"
    },
    {
      "key": "jubilee_lodging_minkshoals_area",
      "type": "text",
      "label": "Lodging Minkshoals Area",
      "def": "Mink Shoals area",
      "studioSection": "Plan your visit and stay"
    },
    {
      "key": "jubilee_lodging_minkshoals_name",
      "type": "text",
      "label": "Lodging Minkshoals Name",
      "def": "Sleep Inn Charleston North",
      "studioSection": "Plan your visit and stay"
    },
    {
      "key": "jubilee_lodging_minkshoals_copy",
      "type": "multiline",
      "label": "Lodging Minkshoals Copy",
      "def": "Hotel accommodations at 2772 Pennsylvania Avenue in the Charleston area, off I-79.",
      "studioSection": "Plan your visit and stay"
    },
    {
      "key": "jubilee_lodging_minkshoals_url",
      "type": "link",
      "label": "Lodging Minkshoals URL",
      "def": "https://www.choicehotels.com/west-virginia/charleston/sleep-inn-hotels/wv412",
      "studioSection": "Plan your visit and stay"
    },
    {
      "key": "jubilee_lodging_walker_area",
      "type": "text",
      "label": "Lodging Walker Area",
      "def": "Nebo",
      "studioSection": "Plan your visit and stay"
    },
    {
      "key": "jubilee_lodging_walker_name",
      "type": "text",
      "label": "Lodging Walker Name",
      "def": "Walker Creek Farms",
      "studioSection": "Plan your visit and stay"
    },
    {
      "key": "jubilee_lodging_walker_copy",
      "type": "multiline",
      "label": "Lodging Walker Copy",
      "def": "Cabins and yurts at 230 Nebo Walker Road in Nebo, for visitors who would enjoy a stay in the country.",
      "studioSection": "Plan your visit and stay"
    },
    {
      "key": "jubilee_lodging_walker_url",
      "type": "link",
      "label": "Lodging Walker URL",
      "def": "https://www.walkercreekfarms.com/cabins-1",
      "studioSection": "Plan your visit and stay"
    },
    {
      "key": "jubilee_lodging_note",
      "type": "multiline",
      "label": "Lodging Note",
      "def": "Contact each property directly for current availability, rates, and reservations.",
      "studioSection": "Plan your visit and stay"
    },
    {
      "key": "jubilee_promo_visible",
      "type": "select",
      "label": "Show the promotion",
      "def": "show",
      "studioSection": "Home and Events promotion",
      "options": [
        {
          "value": "show",
          "label": "Show"
        },
        {
          "value": "hide",
          "label": "Hide after the event"
        }
      ]
    },
    {
      "key": "jubilee_promo_date",
      "type": "text",
      "label": "Event date and location",
      "def": "November 14–18, 2026 · Clay, West Virginia",
      "studioSection": "Home and Events promotion"
    },
    {
      "key": "jubilee_promo_heading",
      "type": "text",
      "label": "Promotion heading",
      "def": "The Appalachian Jubilee",
      "studioSection": "Home and Events promotion"
    },
    {
      "key": "jubilee_promo_sub",
      "type": "multiline",
      "label": "Promotion paragraph",
      "def": "Join us for preaching, choir, and special singing at Fairview.",
      "studioSection": "Home and Events promotion"
    },
    {
      "key": "jubilee_promo_cta",
      "type": "text",
      "label": "Button label",
      "def": "See the Jubilee schedule",
      "studioSection": "Home and Events promotion"
    },
    {
      "key": "hero_bg_jubilee",
      "type": "bg",
      "label": "Jubilee: event hero",
      "def": "/assets/photos/wv-appalachian-mountains.jpg"
    },
    {
      "key": "hero_bg_jubilee_s1",
      "type": "bg",
      "label": "Jubilee: service schedule",
      "def": ""
    },
    {
      "key": "hero_bg_jubilee_s2",
      "type": "bg",
      "label": "Jubilee: plan your visit and stay",
      "def": ""
    },
    {
      "key": "photo_jubilee_flyer",
      "type": "image",
      "label": "Jubilee: speaker flyer",
      "def": "/assets/photos/appalachian-jubilee-2026.png"
    },
    {
      "key": "photo_jubilee_music_flyer",
      "type": "image",
      "label": "Jubilee: music flyer",
      "def": "/assets/photos/appalachian-jubilee-music-2026.png"
    },
    {
      "key": "photo_jubilee_worship",
      "type": "image",
      "label": "Jubilee: congregation worship",
      "def": "/assets/photos/congregation-worship.jpg"
    },
    {
      "key": "photo_jubilee_fellowship",
      "type": "image",
      "label": "Jubilee: church fellowship",
      "def": "/assets/photos/church-fellowship.jpg"
    },
    {
      "key": "hero_bg_jubilee_promo",
      "type": "bg",
      "label": "Home and Events: Jubilee promotion",
      "def": ""
    },
    {
      "key": "hero_bg_jubilee_music",
      "type": "bg",
      "label": "Jubilee: choir and special singing",
      "def": ""
    },
    {
      "key": "media_style_hero_bg_jubilee",
      "type": "style",
      "label": "Jubilee: mountain hero appearance",
      "def": "{\"v\":1,\"source\":\"image\",\"fit\":\"cover\",\"background\":\"theme\",\"backgroundColor\":\"#123F3D\",\"imageOpacity\":100,\"overlay\":\"left\",\"overlayColor\":\"#0A252C\",\"overlayOpacity\":65,\"desktop\":{\"x\":50,\"y\":50,\"zoom\":100},\"mobile\":{\"x\":65,\"y\":50,\"zoom\":100}}"
    },
    {
      "key": "hero_bg_jubilee_intro",
      "type": "bg",
      "label": "Jubilee: event introduction",
      "def": ""
    },
    {
      "key": "jubilee_music_featured",
      "type": "text",
      "label": "Featured family",
      "def": "Featuring The Matthews Family",
      "studioSection": "Mountain hero",
      "retired": true
    },
    {
      "key": "jubilee_music_dates",
      "label": "Featured family dates",
      "type": "text",
      "def": "Monday-Wednesday, November 16-18",
      "studioSection": "Mountain hero",
      "retired": true
    },
    {
      "key": "jubilee_s3_kick",
      "type": "text",
      "label": "Closing section Script line",
      "def": "We'd love to see you",
      "studioSection": "Closing invitation",
      "retired": true
    },
    {
      "key": "jubilee_s3_heading",
      "type": "rich",
      "label": "Closing section Heading",
      "def": "Planning your *visit?*",
      "studioSection": "Closing invitation",
      "retired": true
    },
    {
      "key": "jubilee_s3_sub",
      "type": "multiline",
      "label": "Closing section Paragraph",
      "def": "If you have questions about Jubilee or need help finding your way to Fairview, get in touch with the church. We are glad to help.",
      "studioSection": "Closing invitation",
      "retired": true
    },
    {
      "key": "hero_bg_jubilee_s3",
      "type": "bg",
      "label": "Jubilee: plan your visit",
      "def": "",
      "retired": true
    }
  ]
});
window.FBT_SCHEMA.mediaSlots = window.FBT_SCHEMA.mediaSlots.concat([
  {
    "key": "hero_bg_jubilee",
    "label": "Jubilee: event hero",
    "page": "/jubilee",
    "pageLabel": "Jubilee page",
    "textKeys": [
      "jubilee_hero_kick",
      "jubilee_hero_heading",
      "jubilee_dates",
      "jubilee_hero_sub"
    ],
    "defaultBackground": "#123F3D",
    "defaultTextColors": {
      "kick": "#F0D36F",
      "heading": "#FFF8E6",
      "accent": "#F0D36F",
      "sub": "rgba(255,248,230,.87)"
    },
    "kind": "background",
    "ratio": "hero-home",
    "backdrop": "linear-gradient(155deg,#123F3D,#0A2B2D)",
    "dark": true,
    "previewTypography": "jubilee-hero",
    "previewScrim": false
  },
  {
    "key": "hero_bg_jubilee_intro",
    "label": "Jubilee: event introduction",
    "page": "/jubilee#jubilee-intro",
    "pageLabel": "Jubilee page",
    "textKeys": [
      "jubilee_intro_kick",
      "jubilee_intro_heading",
      "jubilee_intro_copy",
      "jubilee_host"
    ],
    "kind": "background",
    "ratio": "hero-page",
    "backdrop": "#FAF6ED",
    "dark": false
  },
  {
    "key": "hero_bg_jubilee_s1",
    "label": "Jubilee: service schedule",
    "page": "/jubilee#jubilee-details",
    "pageLabel": "Jubilee page",
    "textKeys": [
      "jubilee_schedule_heading",
      "jubilee_schedule_sub",
      "jubilee_sat_day",
      "jubilee_sat_time",
      "jubilee_sat_speakers",
      "jubilee_sun_day",
      "jubilee_sun_time",
      "jubilee_sun_speakers",
      "jubilee_mon_day",
      "jubilee_mon_time",
      "jubilee_mon_speakers",
      "jubilee_tue_day",
      "jubilee_tue_time",
      "jubilee_tue_speakers",
      "jubilee_wed_day",
      "jubilee_wed_time",
      "jubilee_wed_speakers",
      "jubilee_watch_copy"
    ],
    "kind": "background",
    "ratio": "hero-page",
    "backdrop": "#FAF6ED",
    "dark": false
  },
  {
    "key": "hero_bg_jubilee_music",
    "label": "Jubilee: choir and special singing",
    "page": "/jubilee#jubilee-music",
    "pageLabel": "Jubilee page",
    "kind": "background",
    "ratio": "hero-page",
    "backdrop": "#FAF6ED",
    "dark": false,
    "textKeys": [
      "jubilee_music_kick",
      "jubilee_music_heading",
      "jubilee_music_copy",
      "jubilee_music_family_dates"
    ]
  },
  {
    "key": "hero_bg_jubilee_s2",
    "label": "Jubilee: plan your visit and stay",
    "page": "/jubilee#jubilee-visit",
    "pageLabel": "Jubilee page",
    "textKeys": [
      "jubilee_s1_kick",
      "jubilee_s1_heading",
      "jubilee_s1_sub",
      "jubilee_s2_kick",
      "jubilee_s2_heading",
      "jubilee_s2_sub",
      "jubilee_lodging_sutton_area",
      "jubilee_lodging_sutton_name",
      "jubilee_lodging_sutton_copy",
      "jubilee_lodging_elkview_area",
      "jubilee_lodging_elkview_name",
      "jubilee_lodging_elkview_copy",
      "jubilee_lodging_minkshoals_area",
      "jubilee_lodging_minkshoals_name",
      "jubilee_lodging_minkshoals_copy",
      "jubilee_lodging_walker_area",
      "jubilee_lodging_walker_name",
      "jubilee_lodging_walker_copy",
      "jubilee_lodging_note"
    ],
    "kind": "background",
    "ratio": "hero-page",
    "backdrop": "#F2ECDD",
    "dark": false
  },
  {
    "key": "photo_jubilee_flyer",
    "label": "Jubilee: speaker flyer",
    "ratio": "landscape",
    "page": "/jubilee",
    "kind": "photo",
    "pageLabel": "Jubilee page",
    "defaultFit": "contain",
    "backdrop": "#123F3C"
  },
  {
    "key": "photo_jubilee_music_flyer",
    "label": "Jubilee: music flyer",
    "ratio": "landscape",
    "page": "/jubilee",
    "kind": "photo",
    "pageLabel": "Jubilee page",
    "defaultFit": "contain",
    "backdrop": "#123F3C"
  },
  {
    "key": "photo_jubilee_worship",
    "label": "Jubilee: congregation worship",
    "ratio": "landscape",
    "page": "/jubilee",
    "kind": "photo",
    "pageLabel": "Jubilee page"
  },
  {
    "key": "photo_jubilee_fellowship",
    "label": "Jubilee: church fellowship",
    "ratio": "landscape",
    "page": "/jubilee",
    "kind": "photo",
    "pageLabel": "Jubilee page"
  },
  {
    "key": "hero_bg_jubilee_promo",
    "label": "Home and Events: Jubilee promotion",
    "page": "/",
    "pageLabel": "Home page",
    "kind": "background",
    "ratio": "hero-page",
    "backdrop": "#123F3C",
    "dark": true,
    "textKeys": [
      "jubilee_promo_date",
      "jubilee_promo_heading",
      "jubilee_promo_sub",
      "jubilee_promo_cta"
    ]
  }
]);
// Original church assets and the ministry contacts shown on the public pages.
window.FBT_SCHEMA.groups.push({
  "id": "ministry_contacts",
  "title": "Ministry contacts",
  "fields": [
    {
      "key": "gi_hope_leader",
      "label": "H.O.P.E. ministry leaders",
      "type": "text",
      "def": "Curt Moore, Director; Jake Pierson, Assistant Director"
    },
    {
      "key": "gi_youth_leader",
      "label": "Teen ministry leaders",
      "type": "text",
      "def": "Jennings & Nellie Elliott"
    }
  ]
});

// Flat lookup of every field default, for convenience.
window.FBT_SCHEMA.defaults = (function () {
  var d = {};
  window.FBT_SCHEMA.groups.forEach(function (g) {
    g.fields.forEach(function (f) { d[f.key] = f.def || ''; });
  });
  return d;
})();
