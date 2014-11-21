KnockoutJS-brackets 0.0.5
===================

Knockout extension for brackets. It's currently work-in-progress. 
Ideas, contributions and any other support are welcome! :)

## Release notes

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
* Cleaning code up, make some short manual/documentation and release it as 0.1.0.
* Code-linting.

Thanks to:
-----------
* Adobe, for creating brackets (and making it open-source).
* The creator of the AngularJS-brackets extension, AngularUI. Gave me inspiration to create this knockout version that works on a the not-deprecated API's.
* C. Oliff, for making the code-hint library for HTML which I reused to support data-bind hints.