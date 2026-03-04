# SiYuanMemo

[简体中文](https://github.com/Dammyxy/siyuan-plugin-siyuanmemo/blob/main/README_zh_CN.md)

This plugin lets you:

1. Better leverage the **Spaced Repetition System (SRS)** to drive two strategies, **Retrieval Practice** and **Drill Practice**, to memorize anything.
2. Through SiYuan's **bidirectional links** and **Spaced Repetition System**, deeply connect rote-memorized information with the knowledge in your brain, promote transfer learning and fine-grained encoding, wire your brain to the internet, keep knowledge from becoming isolated, and build your own knowledge system.

It currently has these features:

1. **Practice System:** two practice strategies and algorithms

   - Retrieval Practice driven by the spaced repetition algorithm (FSRS)
   - Drill Practice driven by the SuperMemo Final Drill dynamic algorithm
2. **Neural Roaming System:** combines SiYuan bidirectional links with SuperMemo neural review, enabling inquiry-based learning so knowledge can truly grow freely
3. **Concept/Descriptor Framework (CDF):** a RemNote-style template card-making system that helps you quickly break down information and create cards based on focused, precise, and consistent card-making principles
4. **Comprehensive card-making features**:

   - Formula card creation
   - Image card creation
   - Ordered-list template cards (supports progressive hints during review)
   - Unordered-list template cards (supports summary hints during review)
   - Concept/Descriptor Framework template cards
   - Listener-based card creation

     - Symbol-listener card creation
     - It also listens to SiYuan native 【Quick make card】. After clicking 【Quick make card】, it automatically detects the card format, converts it into card types supported by this plugin, and syncs it to the plugin
   - SiYuan blocks and flashcards are decoupled, so one block can generate multiple cards
   - It does not pollute SiYuan's native review UI; multiple dedicated review UIs are built for newly added card types
5. **Two review entry points**

   - Traditional queue-based review entry

     - Enter review from the right-click menu on the plugin top-bar button
     - Enter review from the browser 【Practice】 button
     - Enter review from 【/Menu】
     - Enter review from the command palette
   - RemNote-style block-level review entry for precise control of review granularity

     - In the document block menu, you can review all flashcards in the current document block and its child blocks
     - In other block menus, you can review all flashcards in the current block and its child blocks
6. **SuperMemo-style SRS Browser**

   - Manage your flashcards in a table view
7. **Five queues**

   - Traditional Retrieval Practice queue
   - SuperMemo-inspired Incremental Learning queue
   - Fallback Final Drill queue
   - Neural Roaming queue that merges bidirectional links and neural review
   - Filtered Review queue that supports precise review-scope adjustments during review
8. **SuperMemo-style queue management**

   - You can sort review queues and review cards in your preferred order
   - You can insert cards into any queue
   - During review, you can insert cards into any position in a queue, or schedule them to the future
9. **Card planning features for a better review experience**

   - Postpone
   - Advance
   - Spread

When SiYuan was about to build flashcards, I had these ideas in mind. Now the timing is right, so I built them first. This plugin has only reached the second stage of flashcards, and there is still a lot to improve. Below is a brief feature introduction:

# SRS Browser

![image](https://raw.githubusercontent.com/Dammyxy/siyuan-plugin-siyuanmemo/main/assets/image-20260217135755-mcan1zg.png)

- The right side is the preview panel, which previews the block linked to a flashcard. It is locked by default; double-click to unlock.
- The lower-left side is the document panel, which shows the document blocks containing all flashcards. It focuses along with search results, condition filters, and the current queue to help manage flashcards.
- The upper-left side is the queue panel. Entering a queue shows the flashcards in that queue. You can right-click for management actions including remove, sort, postpone, and advance.

# Four Flashcard Types

## Practice (Item Card):

- Explanation: Flashcards in the broad sense. Front side asks, back side answers. This is the purest Retrieval Practice.
- How to create?

  - In the plugin, after auto card creation, cards that have a back-side prompt are automatically recognized as item cards.

    - Auto card creation includes:

      - SiYuan native quick card creation
      - Plugin template card creation
      - Plugin symbol card creation
  - You can also manually mark a card type as item in the browser.

## Material (Topic Card):

- Explanation: Reading material.
- How to create?

  - After auto card creation, cards without a back-side prompt are recognized as topic cards. You can also mark them manually in the browser.

## Definition (Descriptor Card, 描述符卡):

- Explanation:

  - Simply put, this is template-based card creation. I first saw it in Ye Ge's article [【随笔】间隔重复软件的两大进路](https://zhuanlan.zhihu.com/p/396445859).
  - It comes from RemNote's **CDF** (Concept/Descriptor Framework), a highly formalized information decomposition tool.
- Essence:

  - It is not only for easier form filling (implementing SuperTag), it is also a kind of "attention programming" that introduces an expert perspective. Like AI prompts, you can guide your attention by customizing descriptors in CDF, helping you identify useful parts of information. It is like wearing a persona mask to reuse an expert perspective.
  - For students, this kind of structured tool is very convenient.
- How to create?

  - You need to use **transitive bidirectional links** to bind concepts, as demonstrated below.

## Concept (Concept Card):

- Explanation:

  - It is not only the concept used to bind descriptors in CDF (Concept/Descriptor Framework), but also the concept used for neural review in SuperMemo. In this plugin, concepts are the seed nodes of the **Neural Roaming** queue.
- In terms of bidirectional links, a concept card is a document block in SiYuan.
- How to create?

  - Click the document block icon, and you will see these two buttons:

    - Create as Concept Card and Add to Queue
    - Create as Concept Card and Roam Immediately

# Five Queues

## Three Dynamic Queues

### Retrieval Practice

- Queue card sources:

  - Fetch item and descriptor cards that are due today and cards manually added to queue
- Algorithm:

  - Driven by FSRS.

### Incremental Learning

- Queue card sources:

  - Fetch all card types that are due today and manually added to queue
- Algorithm:

  - Item and descriptor use FSRS; topic and concept use another algorithm.

### Filtered Review

- Queue card sources:

  - Fetch cards into the queue based on filter conditions for review. Normal rating will remove cards. Clicking 【Rebuild】 fetches cards into the queue again.
  - ![image](https://raw.githubusercontent.com/Dammyxy/siyuan-plugin-siyuanmemo/main/assets/image-20260217151638-cgm7my8.png)
- Algorithm:

  - Item and descriptor use FSRS; topic and concept use another algorithm.

## One Static Queue - 【Final Drill】

- Design origin: It should actually be called "Final Drill", from SuperMemo finaldrill.
- Queue card sources:

  1. In Retrieval Practice, Incremental Learning, and Filtered Review queues, cards rated lower than 3 will automatically drop into the 【Final Drill】 queue.
  2. Manually select flashcards in the browser and add them.
- Algorithm:

  - Ratings do not affect spaced-repetition scheduling. In this queue, only flashcards rated 4 are removed from the queue. If you keep giving rating 3, it can never be finished.
  - Queue sorting uses a local shuffle algorithm. See [Final drill algorithm](https://supermemopedia.com/wiki/Final_drill_algorithm) for details.

## One Queue That Is Hard to Classify - Neural Roaming

- Design origin: SiYuan bidirectional links + SuperMemo neural review
- Queue card sources: The roaming objects are SiYuan blocks. This queue automatically fetches concept-card backlinks, references that appear in backlinks, and descriptor cards of concepts for roaming.
- Algorithm: Spreading activation.
- Tip: During roaming, when you encounter document-block reference anchor text, right-click and choose "Create as Concept Card and Add to Queue". Then the forward links of that concept card can also join the queue for roaming. The logic is:

  - Forward links = references to other concepts (document blocks) in the concept card's main text
  - Backlinks = main text
  - Forward links = references to other concepts in the concept card's backlinks
  - ![image](https://raw.githubusercontent.com/Dammyxy/siyuan-plugin-siyuanmemo/main/assets/image-20260217163333-r5n304c.png)

# Quick Card Creation

## Symbol Card Creation

- It listens for symbols and supports fast card creation with:

  - `>>`

    - Forward card
    - Question`>>`Answer
  - `<<`

    - Reverse card
    - Answer`<<`Question
  - `<>`

    - Bidirectional card
    - Term`<>`Definition
    - Generates two cards
  - `;;`

    - Descriptor card
    - Attribute`;;`Description
  - `==挖空==` `{{挖空}}` SiYuan markers

    - Cloze card
    - Text`{{blank}}` or `==highlight==` or SiYuan marker (ALT+D)
    - Multiple cloze markers generate multiple cards
  - Symbols wrapped in `` are not listened to. After typing symbols, press Enter once and make the block lose focus to trigger auto card creation.

## Template Card Creation

Ordered-list templates create cards in batches and share one block ID. Each card can have its own question supplement and hint.

- Card creation steps:

  1. Mandatory requirement -> child list blocks must be an ordered list
  2. Review entry -> right-click the parent list-item block
  3. Create card button -> in block menu choose 【Plugin】—【siyuanmemo】—【Create ordered list card】
- Writing question supplements and hints:

  - Hint -> Question
  - Example: in step 1's `Mandatory requirement -> child list blocks must be an ordered list`:

    - Before the symbol -> the text 【Mandatory requirement】 is the hint
    - After the symbol -> the text 【child list blocks must be an ordered list】 is the question
- Card creation demo:

  - ![PixPin_2026-02-17_17-02-23](https://raw.githubusercontent.com/Dammyxy/siyuan-plugin-siyuanmemo/main/assets/PixPin_2026-02-17_17-02-23-20260217170230-5lnj8ae.gif)
- Review effect:

  - ![PixPin_2026-02-17_17-20-40](https://raw.githubusercontent.com/Dammyxy/siyuan-plugin-siyuanmemo/main/assets/PixPin_2026-02-17_17-20-40-20260217172050-aplrjnx.gif)

## Formula Card Creation

![image](https://raw.githubusercontent.com/Dammyxy/siyuan-plugin-siyuanmemo/main/assets/image-20260303060036-bm0b9tb.png)

- How to use?

  1. Click the formula block
  2. Select the part to cloze and press ALT+Z
  3. You can create multiple clozes; each cloze generates one card
  4. If symbol-listener card creation is enabled, click anywhere and press Enter to trigger formula-block card creation
- Review effect

  - ![image](https://raw.githubusercontent.com/Dammyxy/siyuan-plugin-siyuanmemo/main/assets/image-20260303070341-cfaw1gq.png)

PS: You can also use native quick card creation. It can correctly identify multiple clozes and sync to the plugin.

## Image Card Creation

- How to use?

  1. Click the menu in the upper-right corner of an image, then find 【Create image occlusion card】 in plugin options
  2. Create cards in the 【Image occlusion card】 editor and drag to create occlusions

     ![image](https://raw.githubusercontent.com/Dammyxy/siyuan-plugin-siyuanmemo/main/assets/image-20260303060441-6so7gwj.png)
  3. After adding an occlusion, click to select it, then enter a hint to use as the card question
  4. Click 【Temporary Drill】 to review (Final Drill mode: ratings lower than 4 will not remove cards. If you need other practice modes, use the block menu)

     ![image](https://raw.githubusercontent.com/Dammyxy/siyuan-plugin-siyuanmemo/main/assets/image-20260303060949-8ykx7lp.png)

## CDF Card Creation

- How to use?

  - Concept Descriptor Cards

    - Use **关联型双链 (Associative bidirectional links)** in list outlines

      1. Create list blocks
      2. Add a reference to a concept document block in the parent block

      - Method 1:

        1. Enable **Auto card creation** in plugin settings
        2. Use `描述符;;文本` in a child block
        3. Press Enter after writing, and it is automatically recognized and created as a descriptor card
        4. The referenced document block is automatically bound as the parent concept
        5. If the parent referenced document block is not a concept card, it is automatically created as a concept card
      - Method 2:

        1. Use `描述符;;文本` in a child block
        2. Right-click the paragraph block inside it (place cursor elsewhere, then right-click the paragraph block inside) -> 【Plugin】—【SiYuanMemo】—【Quick make card】—【Descriptor card】
        3. The referenced document block is automatically bound as the parent concept
        4. If the parent referenced document block is not a concept card, it is automatically created as a concept card
    - Example:

      - [[中子星]]

        - Definition;;An extremely dense celestial body between a white dwarf and a black hole
        - *Predecessor*;; **Core remnant** of a star with **8-30 solar masses**
        - *Intuitive density* ;; **One teaspoon** weighs **1 billion tons**
        - *Special variant* ;; **Pulsar** (Pulsar)
        - *Critical point* ;; **Oppenheimer limit** (beyond this, it collapses into a black hole)
    - Review effect:

      - ![PixPin_2026-02-17_18-09-48](https://raw.githubusercontent.com/Dammyxy/siyuan-plugin-siyuanmemo/main/assets/PixPin_2026-02-17_18-09-48-20260217181023-945qx07.gif)
  - Concept Definition Cards

    1. Enter document-block reference + `::` + definition content
    2. Example: `[[制卡]]::通过 prompts 进行注意力编程`
    3. If symbol listening is enabled, cards are auto-created
    4. If symbol listening is not enabled, use block menu -> 【SiYuanMemo】—【Quick make card】—【Concept definition card】 to create
    5. It generates two cards (front and back)
    6. Effect:

       - ![image](https://raw.githubusercontent.com/Dammyxy/siyuan-plugin-siyuanmemo/main/assets/image-20260303065744-sjyeksw.png)
       - ![image](https://raw.githubusercontent.com/Dammyxy/siyuan-plugin-siyuanmemo/main/assets/image-20260303065804-3q650qn.png)
  - Other CDF card types need to be triggered from block menu -> 【SiYuanMemo】—【Quick card】 entry. You can check the specific formats in the 【Quick card】 UI.
- Tips:

  - Delete descriptor cards:

    - For stability reasons, descriptor cards are created from paragraph blocks. If you want to delete cards in the SiYuan editor, place the cursor in the target block, press ctrl+/ to open the paragraph block menu, then unmark as flashcard.
    - Or delete directly in the SRS Browser.
  - Build a template for your frequently used descriptor combinations!

    1. Focus on your descriptor combination
    2. Click the document-block icon at the top right
    3. Export - Template
    4. Under the corresponding concept, use block menu **/Template** to invoke the corresponding descriptor template
    5. ![image](https://raw.githubusercontent.com/Dammyxy/siyuan-plugin-siyuanmemo/main/assets/image-20260217175020-s0zufqu.png)
  - General descriptor sharing: [通用描述符 - 知乎](https://zhuanlan.zhihu.com/p/274891979)

# Decouple SiYuan Blocks and Flashcards: One Block Generates Multiple Flashcards

- For normal flashcards, one block still maps to one card. Bidirectional cards, list template cards, and multi-cloze cards use this mechanism.

# Flashcard Planning

## Sorting

- In the browser, you can sort flashcards in a queue. After sorting and applying to the queue, the review order will also change

  - Click browser field sorting
  - Right-click sorting
  - Demo:

    - ![PixPin_2026-02-17_18-42-17](https://raw.githubusercontent.com/Dammyxy/siyuan-plugin-siyuanmemo/main/assets/PixPin_2026-02-17_18-42-17-20260217184242-9clerkh.gif)

## Advance

- In the browser, right-click a card and choose 【Advance】, corresponding to 【Postpone】
- ![image](https://raw.githubusercontent.com/Dammyxy/siyuan-plugin-siyuanmemo/main/assets/image-20260217184325-hduqqmx.png)

## Postpone

- In the browser, right-click a card and choose postpone
- ![image](https://raw.githubusercontent.com/Dammyxy/siyuan-plugin-siyuanmemo/main/assets/image-20260217184540-o1c2fwv.png)

## Spread

- There is a 【Spread】 button on the browser toolbar. Clicking it opens the panel
- ![image](https://raw.githubusercontent.com/Dammyxy/siyuan-plugin-siyuanmemo/main/assets/image-20260217185204-zpfvb1p.png)
- Note: Under all flashcards, the 【Spread】 feature has two modes. One handles unreviewed flashcards (backlog; by default, "consider future reviews" is unchecked). The other considers flashcards scheduled for review in the coming year, selectable by adjusting the collection period.
- In queue view, clicking 【Spread】 collects due cards by default, and the collection period cannot be changed.
