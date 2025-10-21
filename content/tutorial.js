(() => {
  'use strict';

  const TUTORIAL_MESSAGE_TYPE = 'EXT_OPEN_TUTORIAL_DIALOG';
  const TUTORIAL_DIALOG_ID = 'ext-tutorial-dialog';

  let tutorialDialogRef = null;

  setupTutorialDialogBridge();

  function setupTutorialDialogBridge() {
    if (!chrome?.runtime?.onMessage?.addListener) return;
    if (window.__extTutorialBridgeBound) return;
    window.__extTutorialBridgeBound = true;
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      try {
        if (!msg || typeof msg !== 'object' || msg.type !== TUTORIAL_MESSAGE_TYPE) {
          return;
        }
        openTutorialDialog();
        if (typeof sendResponse === 'function') {
          sendResponse({ ok: true });
        }
      } catch (err) {
        console.error('Tutorial dialog handling failed:', err);
      }
    });
  }

  function ensureTutorialDialog() {
    if (tutorialDialogRef && tutorialDialogRef.isConnected) {
      return tutorialDialogRef;
    }
    const existing = document.getElementById(TUTORIAL_DIALOG_ID);
    if (existing instanceof HTMLDialogElement) {
      tutorialDialogRef = existing;
      bindTutorialDialogControls(existing);
      return existing;
    }

    const mountRoot = document.body || document.documentElement;
    if (!mountRoot) return null;

    const dialog = document.createElement('dialog');
    dialog.id = TUTORIAL_DIALOG_ID;
    dialog.className = 'ext-tutorial-dialog';
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('role', 'dialog');

    function getImgURL(path) {
      return chrome.runtime.getURL(`assets/${path}`);
    }

    dialog.innerHTML = `
      <div class="ext-tutorial-dialog__content">
        <header class="ext-tutorial-dialog__header">
          <h2 class="ext-tutorial-dialog__title">Map Making App Refreshed: Tutorial</h2>
          <button type="button" class="button ext-tutorial-dialog__close" focusable="false" data-role="tutorial-close" aria-label="Close tutorial">&times;</button>
          <p class="ext-tutorial-dialog__lead">Welcome to Map Making App Refreshed! This document will hopefully provide you with a good sense of how to use the new features added by this extension. If you are new to the website, please read the site's manual before continuing.</p>
        </header>

        <section class="ext-tutorial-dialog__section">
          <h3 class="ext-tutorial-dialog__section-title">Getting Started - The Extension Popup</h3>
          <p>You can access the main extension settings under the extension popup. You already know how to get here, of course!</p>
          <img src="${getImgURL('tutorial0-0.webp')}" alt="Extension Manager Screenshot"/>
          <p>This includes controls for the following features:</p>
          <ol class="ext-tutorial-dialog__list">
            <li>Custom site themes</li>
            <li>Toggle the floating panel layout</li>
            <li>Toggle the homepage redesign</li>
            <li>Keyboard shortcuts</li>
          </ol>
          <p>Any time these settings are changed, they must be saved using the "Apply Changes" button at the top of the Settings section. Let's go over each setting below:</p>

          <h4>Site Themes</h4>
          <p>The extension allows you to choose custom color themes for the site. You can change the panel background color (BG1), the secondary background color (BG2), the foreground text color (Color), and the highlight color (Highlight):</p>
          <img src="${getImgURL('tutorial0-1.webp')}" alt="Extension Theme Color Screenshot" width="100%"/>
          <p>There are also three preset color themes to choose from: Default Dark, Default Light, and Default Glass.</p>
          <p>Finally, the user can save their own custom themes. First, make the desired changes in the color pickers, then click the "Save" button. This will prompt you to enter a name for the theme:</p>
          <img src="${getImgURL('tutorial0-2.webp')}" alt="Extension Theme Save Screenshot"/>
          <p>Which will then be saved in the "Custom Themes" section. You can then click "Apply Changes" to see your new theme in action. Below, I have demonstrated an example "Pink Theme":</p>
          <img src="${getImgURL('tutorial0-3.webp')}" alt="Extension Theme Applied Screenshot"/>
          <p> The color choices are certainly questionable, but you get the idea.</p>
          <p> NOTE: Custom themes are stored in the browser's local storage, and are not synced to your account. This means that custom themes will not be shared between users, and will not be present if you open the map on a different device or browser. I will try my best to improve this functionality in the future.</p>

          <h4>Panel Layout</h4>
          <p>The extension also allows the user to enable or disable the floating panel layout. When enabled, panels will float above the background map:</p>
          <img src="${getImgURL('tutorial0-4.webp')}" alt="Extension Floating Panels Enabled Screenshot" width="100%"/>
          <p>When the setting is disabled, the site returns to its normal layout:</p>
          <img src="${getImgURL('tutorial0-5.webp')}" alt="Extension Floating Panels Disabled Screenshot" width="100%"/>

          <h4>Homepage Redesign</h4>
          <p>The extension also allows the user to enable or disable the homepage redesign. This design gets rid of the list and replaces it with a larger "card" view with customizable colors for easy differentiation. If you like it, you may enable it, but it is disabled by default. If you enable the homepage redesign, there is an additional setting to toggle the early beta for the low-poly terrain generation background.</p>
          <img src="${getImgURL('tutorial0-6.webp')}" alt="Extension Homepage Redesign Enabled Screenshot" width="40%"/>
          <p>Both of these features are discussed in detail in the "Homepage Redesign" section later in the document.</p>

          <h4>Keyboard Shortcuts</h4>
          <p>The extension also adds a few keyboard shortcuts. I consolidated most of the site's shortcuts into the "Keyboard Shortcuts" section of the popup. These cannot be changed (although I might change this in a future update):</p>
          <img src="${getImgURL('tutorial0-7.webp')}" alt="Extension Keyboard Shortcuts Screenshot"/>
        </section>

        <section class="ext-tutorial-dialog__section">
          <h3 class="ext-tutorial-dialog__section-title">The New Floating Panel Layout</h3>
          <p>Once you run the extension, you'll notice a new floating panel layout. The extension turns the map into the main background of the site, allowing for more navigability, while keeping the editors minimal and out of view. Remember, it can always be disabled in the extension popup. There are a few features available to modify this floating layout:</p>
          <ol class="ext-tutorial-dialog__list">
            <li>Edit panel layout</li>
            <li>Reset to default positions</li>
            <li>Set/clear default layout</li>
          </ol>
          <p>All of these features can be seen in the layout menu after clicking the "Layout" button in the top-right corner:</p>
          <img src="${getImgURL('tutorial1-0.webp')}" alt="Extension Floating Panel Layout Button Screenshot"/>

          <h4>Editing the Panel Layout</h4>
          <p>While the panels are floating, you can edit their positions by pressing the "Edit panel layout" option in the layout menu, or by pressing E. The panels will now get a highlight border, meaning they can be dragged around the editor:</p>
          <img src="${getImgURL('tutorial1-1.webp')}" alt="Extension Edit Floating Panel Screenshot"/>
          <p>Panels such as the Street View preview panel and the main editor panel can also be resized to different dimensions using the handles on the corners.</p>

          <h4>Resetting the Panel Layout</h4>
          <p>If you have altered the positions or sizes of the panels and wish to return to the default layout, you can do so by clicking the "Reset panels to default" option in the layout menu, or by pressing Q. This will restore the default positions and dimensions of all panels.</p>

          <h4>Setting/Clearing the Default Layout</h4>
          <p>If you find yourself using a certain layout that is different from the preset, you can click the "Set as default layout" option in the layout menu to save this as the default layout. IF you set a default layout, clicking "Reset panels to defaults" or Q will restore this position instead.</p>
          <p>If you want to get rid of your custom default position and restore the original values, you can hold down Control/Command with the layout menu open - this will change the "Set as default layout" option to a new "Clear default layout" option.</p>
          <h4>Note:</h4>
          <p>Panel positions are saved in the browser's local storage, and are not synced to your account. This means that panel positions will not be shared between users, and will not be present if you open the map on a different device or browser. I will try my best to improve this functionality in the future.</p>
        </section>

        <section class="ext-tutorial-dialog__section">
          <h3 class="ext-tutorial-dialog__section-title">The New Header</h3>
          <p>In the top-left corner, there is a floating panel that displays the name of the map.</p>
          <img src="${getImgURL('tutorial2-0.webp')}" alt="Extension Floating Header Screenshot"/>
          <p>This is the header, and has had some slight modifications:</p>
          <ol class="ext-tutorial-dialog__list">
            <li>The "exit" button is separated from the main header, and when clicked sends the user back to the homepage. The resdesigned homepage is discussed later in the document.</li>
            <li>Hovering over the name of the map reveals the import and export buttons, which were moved from the bottom of the site. Since they are used less frequently, I felt like hiding them would help save space for a cleaner look:</li>
            <img src="${getImgURL('tutorial2-1.webp')}" alt="Extension Floating Header Expanded Screenshot" width="60%"/>
          </ol>
        </section>

        <section class="ext-tutorial-dialog__section">
          <h3 class="ext-tutorial-dialog__section-title">The New Settings Button</h3>
          <p>The extension consoldiates all of the settings on the site into one simple popup. This should hopefully make accessing the settings easier:</p>
          <img src="${getImgURL('tutorial3-0.webp')}" alt="Extension Settings Popup Screenshot"/>
          <p> All of the settings from the site should be present here. There will be more settings added in future updates.</p>
          <p> NOTE: currently, the extension does not support map styles completely. To manager your styles (add, delete, etc), you must disable the extension. Additionally, changing the map style currently requires a reload to take effect. I plan to improve this in a future update.</p>
          <p>When you open the Street View preview panel, the settings button reveals the "Hide car" and "Show crosshair" settings instead of the full settings menu:</p>
          <img src="${getImgURL('tutorial3-1.webp')}" alt="Extension Street View Settings Screenshot" width="50%"/>
        </section>

        <section class="ext-tutorial-dialog__section">
          <h3 class="ext-tutorial-dialog__section-title">The Control Panel</h3>
          <p>The extension also consoldiates all of the site controls into one panel. All controls on the original site are present here:</p>
          <img src="${getImgURL('tutorial4-0.webp')}" alt="Extension Controls Panel Screenshot" width="40%"/>
          <p> Notably, there is one new control:</p>
          <img src="${getImgURL('tutorial4-1.webp')}" alt="Extension Map Click Mode Screenshot" width="30%"/>
          <p> This setting determines what will happen when you click on the map:</p>
          <ol class="ext-tutorial-dialog__list">
            <li>Add: the default behavior. This mode will add a new location wherever you click on the map.</li>
            <li>Move: moves the currently selected location to the new place clicked on the map, including data such as tags, etc.</li>
          </ol>
          <p>You can quickly change between the two modes using 1 for Add and 2 for Move. Please note that you cannot use the Move mode when you do not have a location selected (obviously, how will the code know which one to move otherwise lmao)</p>
        </section>

        <section class="ext-tutorial-dialog__section">
          <h3 class="ext-tutorial-dialog__section-title">The Main Editor</h3>
          <img src="${getImgURL('tutorial5-0.webp')}" alt="Extension Main Editor Screenshot" width="100%"/>
          <p>The main editor received the most changes from this extension. They are detailed below:</p>
          <ol class="ext-tutorial-dialog__list">
            <li>Updated tag manager</li>
            <li>Improved tag search functionality</li>
            <li>Updated shape manager</li>
            <li>Updated selections</li>
            <li>Updated "Bulk-Add" tags</li>
            <li>Integrated search bar</li>
            <li>Integrated command palette</li>
          </ol>

          <h4>The New Tag Manager</h4>
          <p>The tag manager has a few notable updates. Let's review each change using this image:</p>
          <img src="${getImgURL('tutorial5-1.webp')}" alt="Extension Tag Manager Screenshot" width="100%"/>
          <p>First, there is a new look to the tags (#1). The tag "edit" button has now been moved for a cleaner look, and the location counter has been moved to a little badge in the top corner. This gives priority to the name of the tag over other things, which should make it easier to identify and click tags.</p>
          <img src="${getImgURL('tutorial5-2.webp')}" alt="Extension Tag Manager Tag Screenshot" width="40%"/>
          <p>To access extra tag actions, right-click the tag. This menu contains the moved "edit" button, allowing you to change the name and color of the tag. There are also a few other options, shown below:</p>
          <img src="${getImgURL('tutorial5-3.webp')}" alt="Extension Tag Manager Tag Context Menu Screenshot" width="60%"/>
          <p>Next, let's look at the whole tag container (#2). The extension adds support for tag sections, allowing you to separate tags into distinct categories. Each section can be collapsed, sorted (#3), and renamed (#4). You can create new sections using the "+" button (#5). Here is an example where I have created two sections, called "Camera Generation" and "Other". The sorting menu is open, and you can see the sorting options (Custom, Name, and Amount):</p>
          <img src="${getImgURL('tutorial5-4.webp')}" alt="Extension Tag Manager Section Example Screenshot" width="100%"/>
          <p>To move tags between sections, simply drag them into the desired section. You can also reorder tags within a section by dragging. To delete a section, click the "x" button in the top-right corner of each section. Deleting a section will move the tags in that section to the one above it. The top section cannot be deleted.</p>
          <p>NOTE: you can only drag tags between two sections if they are both in the "Custom" sorting mode.</p>

          <h4>The New Tag Search Functionaliy</h4>
          <p>In addition to the improved tag manager, there is also better search functionality. To search tags, use the "Search tags..." field in the tag manager. This will search through the tags and create a dropdown displaying relevant tags matching your search. Tags can be selected straight from the dropdown, creating a more seamless experience. Additionally, this dropdown works even when the tag manager is collapsed.</p>
          <img src="${getImgURL('tutorial5-5.webp')}" alt="Extension Tag Filter Screenshot"/>

          <h4>The New Shapes Manager</h4>
          <p>This extension also adds a brand-new shapes manager to store polygons drawn on the map. For consistency, the layout is nearly identical to the one for tags - each new shape is added to the shape manager, with the default name "Polygon" and a unique color. The shapes and rearrangeable, and can be edited or deleted by right-clicking and choosing an option in the dropdown.</p>
          <p>To add a shape to the shape manager, simply draw it on the map using the "Draw a polygon" and "Draw a rectangle" buttons on the control panel. Shapes will automatically be added to the selections and the manager. Additionally, you can also import and export geoJSON files into the shapes manager. Below is a demo with 11 shapes:<p>
          <img src="${getImgURL('tutorial5-6.webp')}" alt="Extension Shape Manager Screenshot" width="100%"/>
          <p>Deleting a shape will reveal a confirmation popup - this is to avoid accidental deletions. To avoid this and delete the shape immediately, hold down Control/Command with the menu open, which will change the "Delete" option to "Delete now" instead.</p>
          <p>NOTE: The shapes are stored in the browser's local storage, and are not saved to your account. This means that shapes will not be shared between users, and will not be present if you open the map on a different device or browser. I will try my best to improve this functionality in the future.</p>

          <h4>The New Selections</h4>
          <p>Tag/shape selections have also had some slight visual updates. Notably, the "Invert selection" and "Review selection" options have been given their own dedicated buttons:</p>
          <img src="${getImgURL('tutorial5-7.webp')}" alt="Extension Selection Manager Screenshot" width="100%"/>

          <h4>The New "Bulk-Adding Tags" Section</h4>
          <p>Within the "Selections" part of the editor, the Bulk-Add Tags section has had a nice refresh. It now includes a dropdown (just like the tag searcher from earlier) that allows you to select multiple tags to add in bulk. If no tag exists, it will allow you to create a new tag. Once you are done listing all the tags you want added, click the "Apply All" button to add the tags to the current selection.</p>
          <img src="${getImgURL('tutorial5-8.webp')}" alt="Extension Bulk-Add Tags Screenshot" width="100%"/>

          <h4>The New Search Bar</h4>
          <p>At the bottom of the editor, there is a new "Search" section. This contains the search bar, which was moved from its original location to this more consolidated one. Functionally, it is still the same:</p>
          <img src="${getImgURL('tutorial5-9.webp')}" alt="Extension Search Bar Screenshot" width="100%"/>

          <h4>The New Command Palette</h4>
          <p>Within the "Tools" section of the editor, there is a "Commands" button. While this was always here, there has been a slight visual update to the palette. Instead of taking up the whole screen, the command palette now exists as a popup that comes out of the button. This provides a more consistent visual experience when using the editor. Functionally, it is still exactly the same. When the editor is not open (e.g. previewing a Street View location), the default command palette opens instead.</p>
          <img src="${getImgURL('tutorial5-10.webp')}" alt="Extension Command Palette Screenshot" width="100%"/>
        </section>

        <section class="ext-tutorial-dialog__section">
          <h3 class="ext-tutorial-dialog__section-title">The New Street View Preview</h3>
          <img src="${getImgURL('tutorial6-0.webp')}" alt="Extension Street View Preview Screenshot" width="100%"/>
          <p>After clicking a location on the map, you open a Street View preview panel that displays the Google Street View panorama for that specific location. There are a few changes that have been made to this feature:</p>
          <ol class="ext-tutorial-dialog__list">
            <li>Updated tags</li>
            <li>Updated panorama controls</li>
            <li>New mini map</li>
          </ol>

          <h4>The New Preview Tags</h4>
          <p>Just like the tags in the editor, the tags in the Street View preview have also been modified. Originally, each tag had a dedicated "+" button that would add it to the current location. Since it was the only button, I just decided to remove it. Now, you can click anywhere on a tag to add/remove it from a location:</p>
          <img src="${getImgURL('tutorial6-1.webp')}" alt="Extension Street View Preview Tag Screenshot" width="50%"/>

          <h4>The New Preview Tags</h4>
          <p>The Street View panorama controls have also been consolidated into two panels for easy access. There isn't any new functionality, just a stylistic difference:</p>
          <img src="${getImgURL('tutorial6-2.webp')}" alt="Extension Street View Panorama Controls Screenshot" width="100%"/>

          <h4>The Mini Map</h4>
          <p>When you enter fullscreen mode for a certain location (you can actually use the shortcut F to make it faster!), there is a brand-new minimap that appears in the bottom right corner:</p>
          <img src="${getImgURL('tutorial6-3.webp')}" alt="Extension Mini Map Screenshot" width="100%"/>
          <p>This minimap is a shrunk-down version of the main map, allowing you to navigate quickly between locations. Additionally, you still have access to the Add and Move modes from earlier, allowing you to add or move locations on the map without exiting fullscreen. The shortcuts 1 & 2 also still work here to switch modes efficiently.</p>
        </section>

        <section class="ext-tutorial-dialog__section">
          <h3 class="ext-tutorial-dialog__section-title">The Homepage Redesign</h3>
          <p>If you enable the homepage redesign in the extension popup, the homepage will look something like this:</p>
          <img src="${getImgURL('tutorial7-0.webp')}" alt="Extension Homepage Screenshot" width="100%"/>
          <p>This new design replaces the list with a new card view. This is more stylized, and allows for easy differentiation with customizable colors. The colors can be edited by clicking the "settings" button for a specific map, which appears when you hover your cursor over it:</p>
          <img src="${getImgURL('tutorial7-1.webp')}" alt="Extension Homepage Map Settings Screenshot" width="50%"/>
          <p>If you also enable the beta low-poly terrain generation feature, the map will now have a randomly generated low-poly terrain background. This background can also be customized using the settings button mentioned earlier. You can choose between 4 landscape/biomes (more coming soon!), and also set the sun angle and resolution. Here is an example of a map with a mountainous terrain background at sunset, with the settings panel open:</p>
          <img src="${getImgURL('tutorial7-2.webp')}" alt="Extension Homepage Map Terrain Screenshot" width="50%"/>
        </section>

        <section class="ext-tutorial-dialog__section">
          <h3 class="ext-tutorial-dialog__section-title">Conclusion</h3>
          <p>Congrats, you made it to the end! This should cover most if not all of the features added by the extension. If you have noticed anything absent, typos, or bugs, feel free report any feedback here:</p>
          <a class="popup-links" href="https://forms.gle/WZJqvFshr5q3RDMy7" target="_blank" rel="noopener noreferrer">Feedback Form</a>
          <p>As I've mentioned, projects like these take a long time (just look at how long this document is!). If you are interested in supporting my work and continuing the development of this extension, please consider donating:</p>
          <a class="popup-links" href="https://buymeacoffee.com/ccosine" target="_blank" rel="noopener noreferrer">Support me! &#x1FA77;</a>
          <p>Whatever you choose to do, thank you for using Map Making App Refreshed! Simply using this extension means the world to me, and I hope you enjoy using it as much as I enjoyed making it.</p>
        </section>

        <section>
          <p class="ext-tutorial-dialog__note">I plan to keep this project updated, so there will hopefully be more features on the way.</p>
          <a class="ext-tutorial-dialog__note" href="https://github.com/ruhan-p/Map-Making-App-Reloaded" target="_blank" rel="noopener noreferrer">Check out the GitHub!</a>
        </section>
        </div>
      </div>
    `;

    mountRoot.appendChild(dialog);
    tutorialDialogRef = dialog;
    bindTutorialDialogControls(dialog);
    return dialog;
  }

  function bindTutorialDialogControls(dialog) {
    if (!dialog || dialog.__extTutorialBound) return;
    dialog.__extTutorialBound = true;

    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      closeTutorialDialog(dialog);
    });

    dialog.addEventListener('close', () => {
      if (!dialog.isConnected) tutorialDialogRef = null;
    });

    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) {
        closeTutorialDialog(dialog);
      }
    });

    const closeBtn = dialog.querySelector('[data-role="tutorial-close"]');
    if (closeBtn && !closeBtn.__extTutorialBound) {
      closeBtn.__extTutorialBound = true;
      const handleCloseBtnClick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeTutorialDialog(dialog);
      };
      closeBtn.addEventListener('click', handleCloseBtnClick);
      closeBtn.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          closeTutorialDialog(dialog);
        }
      });
    }
  }

  function openTutorialDialog() {
    const dialog = ensureTutorialDialog();
    if (!dialog) return;
    if (dialog.open) {
      try {
        dialog.focus();
      } catch {}
      return;
    }
    try {
      dialog.showModal();
      const closeBtn = dialog.querySelector('.ext-tutorial-dialog__close');
      if (closeBtn) {
        window.setTimeout(() => {
          try { closeBtn.focus({ preventScroll: true }); } catch {}
        }, 50);
      }
    } catch (err) {
      console.error('Failed to open tutorial dialog:', err);
    }
  }

  function closeTutorialDialog(dialog) {
    if (!dialog) return;
    try {
      if (dialog.open) dialog.close();
    } catch (err) {
      console.error('Failed to close tutorial dialog:', err);
    }
  }
})();
