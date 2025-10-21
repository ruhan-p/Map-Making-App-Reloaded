# Map Making App Reloaded

Map Making App Reloaded is a Chrome extension that provides a total rework of ReAnna's Map Making App website (map-making.app). It includes many visual and QOL changes that aim to improve the overall user experience on the site.

## How do I get it?

#### You can get the extension completely free on the Chrome Web Store:


example.com


#### If you like my work, please feel free to donate - projects like these take while and it really helps small developers like me:


[buymeacoffee.com/ccosine](buymeacoffee.com/ccosine)


#### Nonetheless, thank you for using the extension, it means the world to me :)

## Features

#### Main Additions
- Refreshed floating panel layout
     - Can be toggled in the extension popup
- Refreshed home screen with map cards
     - Can be toggled in the extension popup
- Ability to drag and resize different panels in the map editor
- Ability to save the default position of panels
- Ability to move locations
- Various additional keyboard shortcuts
- An updated tag manager to handle multiple separated tag sections
- A shape manager to store and edit polygons
- Enhanced Bulk-Add tag section, allowing for multiple tags to be added
- Minimap within the panorama fullscreen view for more convenient navigation
- Various color themes for the site, which can also be customized and saved

#### Additional QOL:
- Minimal header and exit button to avoid obstruction of the map
- Import and export buttons reveal when the user hovers over the header (since they are used infrequently)
- Consolidated controls into one panel for easier access
- Consolidated settings into one popup for easier access
- Search bar moved into the main panel for more organization
- Command palette converted to a popup for less obstruction
- Removed the three dots in each tag selection, adding dedicated buttons for reviewing and inverting tag selections
- Improved tag search functionality; new dropdown for easy access even when the tags are collapsed
- Larger tags for easier clicking by moving the edit button to the right-click menu
- When adding tags to locations, clicking anywhere on the tag will add it (instead of the small "+" button)
- Tag count moved to a small badge in the corner of each tag for less confusion
- Notifications to inform users of certain actions

#### Early Beta Features:
- Randomized terrain generation for map cards on the homepage, allowing users to distinguish maps by their general landscape
     - Extremely performance heavy (I haven't made too many optimizations yet); enable at your own risk
- Light color theme (I'm sorry, it looks pretty bad right now in this first release - I promise I'll fix it for those of you that like being flashbanged every time you open your computer)

## Known Issues & Limitations
- When the panels are rendered for the first time, they sometimes appear in the incorrect position. This can be resolved by resetting the panel position using (Q) or the layout button.
- Terrain generation has terrible performance (referenced above). This can be resolved for now by simply disabling it until better optimizations come out.
- Map styles cannot be added or changed with the extension enabled - you must disable the extension to do so.

#### Please note that the extension DOES NOT have access to the site's API. Thus, all data stored by the extension (e.g. panel positions, shapes, etc.) only exist in the site's local storage data. Thus, clearing site data will also clear the extension data. Additionally, extension data is not accessible across the user's account, but is saved locally on the browser. Thus, you will not be able to access data stored in the extension anywhere other than the specific machine/browser it was saved on.

## Contributing

Pull requests are welcome. For major changes, please open an issue first
to discuss what you would like to change.

Please make sure to update tests as appropriate.

## License

[MIT](https://choosealicense.com/licenses/mit/)
