KnockoutJS-brackets 0.1.0
===================

Knockout.js extension for brackets. Ideas and contributions are welcome! :)

## Features

* Quick-link to knockout. (Icon, menu and shortcut (Ctrl+Alt+K)).
* Code-hinting in html files with the data-bind attribute.
* Quick-edit for ko.computed. (Ctrl + E).

All features can be disabled separately in the Brackets-preference file:

```JSON
"ericsmekens.knockoutjs.show_icon": true,
"ericsmekens.knockoutjs.code_hint": true,
"ericsmekens.knockoutjs.quick_edit": true
```

## Release notes

### 0.1.0
* Code has been cleaned up, package.json/readme has been updated. 
* More efficient code, seperated in files and more preference settings.

### 0.0.5
* Added a show_icon preference, so users can disable the quick-link icon to knockout-website through the preferences file.
* Basic code-hinting for data-bind="" in .html files.

### 0.0.4
* Added quick-link icon to knockout site.

### 0.0.3
* Tested for brackets 1.0.0. Older versions of brackets may work, but I set 1.0.0 as lowest requirement. You can still use 0.0.2. 
* Removed deprecated function usages.
* Single cursor quick-edit inside a computed name now works.

### 0.0.2
* ko.computed quick-edit works for names with numbers and underscores as well.

### 0.0.1
* First working version 
* Quick-edit for ko.computed. (Not works with numbers in computed name and only works when you fully select the computed's name.)

Currently planning to implement:
-----------
* Code-linting/hinting js. (Waiting for better brackets support on that one.)
* Your feature that you want!

Thanks to:
-----------
* Adobe, for creating brackets (and making it open-source).
* The creator of the AngularJS-brackets extension, AngularUI. Gave me inspiration to create this knockout version that works on a the not-deprecated API's.
* C. Oliff, for making the code-hint library for HTML which I reused to support data-bind hints.