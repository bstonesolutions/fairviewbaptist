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
      hint: 'These replace the built-in photos or add an optional ministry photo. The Get Involved and Visit photo slots stay out of the layout until you add one.',
      fields: [
        { key: 'photo_welcome', label: 'Home welcome photo', type: 'image', def: '' },
        { key: 'photo_visit', label: 'Visit welcome photo', type: 'image', def: '' },
        { key: 'photo_staff_group', label: 'Staff group photo', type: 'image', def: '' },
        { key: 'photo_gi_kids', label: 'Get Involved: Sunday School photo', type: 'image', def: '' },
        { key: 'photo_gi_youth', label: 'Get Involved: Youth Ministry photo', type: 'image', def: '' },
        { key: 'photo_gi_groups', label: 'Get Involved: H.O.P.E. Recovery photo', type: 'image', def: '' },
        { key: 'photo_gi_van', label: 'Get Involved: Van Ministry photo', type: 'image', def: '' },
        { key: 'photo_gi_menswomens', label: 'Get Involved: Soul-Winning Visitation photo', type: 'image', def: '' },
        { key: 'photo_gi_missions', label: 'Get Involved: Missions photo', type: 'image', def: '' },
        { key: 'photo_gi_music', label: 'Get Involved: Music & Choir photo', type: 'image', def: '' },
      ],
    },
    {
      id: 'staff',
      title: 'Staff',
      hint: 'Names, roles, bios and portraits for the Our Staff page.',
      fields: [
        { key: 'pastor_name', label: 'Lead pastor name', type: 'text', def: 'Pastor Michael Spurlock' },
        { key: 'pastor_role', label: 'Lead pastor role', type: 'text', def: 'Pastor' },
        { key: 'pastor_bio', label: 'Lead pastor bio', type: 'multiline', def: 'Pastor Michael Spurlock began serving as pastor of Fairview Baptist Temple in the summer of 2024. With over eight years of full time ministry, his calling has been marked by a passion for souls, Bible centered preaching, and a heart to reach Clay County with the gospel of Jesus Christ. Before coming to Fairview he served at Mt. Pleasant Baptist Church in Elkview, WV and Hanes Baptist Church in Winston-Salem, NC. He holds a Bachelor\'s degree in Theology and a Master\'s in Biblical Exposition from Andersonville Theological Seminary.' },
        { key: 'pastor_photo', label: 'Lead pastor photo', type: 'image', def: '' },

        { key: 'staff1_name', label: 'Jamie Taylor (name)', type: 'text', def: 'Jamie Taylor' },
        { key: 'staff1_role', label: 'Jamie Taylor (role)', type: 'text', def: 'Trustee' },
        { key: 'staff1_bio', label: 'Jamie Taylor (optional bio)', type: 'multiline', def: '' },
        { key: 'staff1_photo', label: 'Jamie Taylor photo', type: 'image', def: '' },

        { key: 'staff2_name', label: 'Robbie King (name)', type: 'text', def: 'Robbie King' },
        { key: 'staff2_role', label: 'Robbie King (role)', type: 'text', def: 'Trustee' },
        { key: 'staff2_bio', label: 'Robbie King (optional bio)', type: 'multiline', def: '' },
        { key: 'staff2_photo', label: 'Robbie King photo', type: 'image', def: '' },

        { key: 'staff3_name', label: 'Frank Kleman (name)', type: 'text', def: 'Frank Kleman' },
        { key: 'staff3_role', label: 'Frank Kleman (role)', type: 'text', def: 'Deacon' },
        { key: 'staff3_bio', label: 'Frank Kleman (optional bio)', type: 'multiline', def: '' },
        { key: 'staff3_photo', label: 'Frank Kleman photo', type: 'image', def: '' },

        { key: 'staff4_name', label: 'Curtis Moore (name)', type: 'text', def: 'Curtis Moore' },
        { key: 'staff4_role', label: 'Curtis Moore (role)', type: 'text', def: 'Deacon' },
        { key: 'staff4_bio', label: 'Curtis Moore (optional bio)', type: 'multiline', def: '' },
        { key: 'staff4_photo', label: 'Curtis Moore photo', type: 'image', def: '' },

        { key: 'staff5_name', label: 'Joyce Legg (name)', type: 'text', def: 'Joyce Legg' },
        { key: 'staff5_role', label: 'Joyce Legg (role)', type: 'text', def: 'Treasurer' },
        { key: 'staff5_bio', label: 'Joyce Legg (optional bio)', type: 'multiline', def: '' },
        { key: 'staff5_photo', label: 'Joyce Legg photo', type: 'image', def: '' },

        { key: 'staff6_name', label: 'Kris Moore (name)', type: 'text', def: 'Kris Moore' },
        { key: 'staff6_role', label: 'Kris Moore (role)', type: 'text', def: 'Secretary' },
        { key: 'staff6_bio', label: 'Kris Moore (optional bio)', type: 'multiline', def: '' },
        { key: 'staff6_photo', label: 'Kris Moore photo', type: 'image', def: '' },
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
        { key: 'tiktok_url', label: 'TikTok URL (optional)', type: 'link', def: '' },
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

// Flat lookup of every field default, for convenience.
window.FBT_SCHEMA.defaults = (function () {
  var d = {};
  window.FBT_SCHEMA.groups.forEach(function (g) {
    g.fields.forEach(function (f) { d[f.key] = f.def || ''; });
  });
  return d;
})();
