/*
   Name: SPUtility.js
   Version: 0.9.0
   Built: 2014-04-02
   Author: Kit Menke
   https://sputility.codeplex.com/
   Copyright (c) 2014
   License: Microsoft Public License (MS-PL)
*/
// Object.create shim for class inheritance
if (!Object.create) {
   Object.create = function (o) {
      if (arguments.length > 1) {
         throw new Error('Object.create implementation only accepts the first parameter.');
      }
      function F() {}
      F.prototype = o;
      return new F();
   };
}

// Export SPUtility global variable
var SPUtility = (function ($) {
   "use strict";
   
   /*
    *   SPUtility Private Variables
   **/
   var _fieldsHashtable = null,
      _isSurveyForm = false; 
   
   /*
    *   SPUtility Private Methods
   **/
   
   function isUndefined(obj) {
      return typeof obj === 'undefined';
   }
   
   function isString(obj) {
      return typeof obj === 'string';
   }
   
   function isNumber(obj) {
      return typeof obj === 'number';
   }
   
   function getInteger(str) {
      return parseInt(str, 10);
   }
   
   function convertStringToNumber(val) {
      if (typeof val === "string") {
         var match = val.match(/[0-9,.]+/g);
         if (null !== match) {
            val = match[0].replace(/,/g, ''); // commas to delimit thousands need to be removed
            val = parseFloat(val);
         }
      }
      return val;
   }

   //+ Jonas Raoni Soares Silva
   //@ http://jsfromhell.com/number/fmt-money [rev. #2]
   // Modified to pass JSLint
   // n = the number to format
   // c = # of floating point decimal places, default 2
   // d = decimal separator, default "."
   // t = thousands separator, default ","
   function formatMoney(n, c, d, t) {
      c = (isNaN(c = Math.abs(c)) ? 2 : c);
      d = (d === undefined ? "." : d);
      t = (t === undefined ? "," : t);
      var s = (n < 0 ? "-" : ""),
         i = parseInt(n = Math.abs(+n || 0).toFixed(c), 10) + "", 
         j = (j = i.length) > 3 ? j % 3 : 0;
      return s + (j ? i.substr(0, j) + t : "") + i.substr(j).replace(/(\d{3})(?=\d)/g, "$1" + t) + (c ? d + Math.abs(n - i).toFixed(c).slice(2) : "");
   }
   
   // Gets the input controls for a field (used for Textboxes)
   function getInputControl(spField) {
      if (spField.Controls === null) {
         // if running on DispForm.aspx Controls will be null
         return null;
      }
      var controls = $(spField.Controls).find('input');
      if (null !== controls && 1 === controls.length) {
         return controls[0];
      }
      
      throw 'Unable to retrieve the input control for ' + spField.Name;
   }
   
   function getHashFromInputControls(spField, selector) {
      var oHash = [], i, 
         inputs = $(spField.Controls).find(selector),
         labels = $(spField.Controls).find("label");
      if (labels.length < inputs.length) {
         throw "Unable to get hashtable of controls.";
      }
      for (i = 0; i < inputs.length; i++) {
         oHash.push({
            key: $(labels[i]).text(),
            value: inputs[i]
         });
      }
      return oHash;
   }
   
   function getHashValue(hash, key) {
      var val = null;
      $(hash).each(function (index, pair) {
         if (pair.key === key) {
            val = pair.value;
            return false;
         }
      });
      return val;
   }
   
   function getSPFieldType(element) {
      var matches, comment, n;
      try {
         // find the HTML comment and get the field's type
         for (n = 0; n < element.childNodes.length; n += 1) {
            if (8 === element.childNodes[n].nodeType) {
               comment = element.childNodes[n].data;
               matches = comment.match(/SPField\w+/);
               if (null !== matches) {
                  return matches[0];
               }
               break;
            }
         }         
      } catch (ex) {
         throw 'getSPFieldType error: ' + ex.toString();
      }
      return null;
   }
   
   function getSPFieldFromType(spFieldParams) {
      var field = null, controls;
      
      switch (spFieldParams.type) {
      case 'SPFieldText':
         field = new SPTextField(spFieldParams);
         break;
      case 'SPFieldNumber':
         field = new SPNumberField(spFieldParams);
         break;
      case 'SPFieldCurrency':
         field = new SPCurrencyField(spFieldParams);
         break;
      case 'SPFieldChoice':
         // is this a normal dropdown field?
         controls = $(spFieldParams.controlsCell).find('select');
         if (controls.length > 0) {
            field = new SPDropdownChoiceField(spFieldParams, controls);
         } else {
            field = new SPRadioChoiceField(spFieldParams);
         }
         break;
      case 'SPFieldMultiChoice':
         field = new SPCheckboxChoiceField(spFieldParams);
         break;
      case 'SPFieldDateTime':
         field = new SPDateTimeField(spFieldParams);
         break;
      case 'SPFieldBoolean':
         field = new SPBooleanField(spFieldParams);
         break;
      case 'SPFieldUser':
      case 'SPFieldUserMulti':
         field = new SPUserField(spFieldParams);
         break;
      case 'SPFieldURL':
         field = new SPURLField(spFieldParams);
         break;
      case 'SPFieldLookup':
         // is this a normal dropdown field?
         controls = $(spFieldParams.controlsCell).find('select');
         if (controls.length > 0) {
            field = new SPDropdownLookupField(spFieldParams, controls);
         } else {
            controls = $(spFieldParams.controlsCell).find('input');
            field = new SPAutocompleteLookupField(spFieldParams, controls);
         }         
         break;
      case 'SPFieldNote':
         controls = $(spFieldParams.controlsCell).find('textarea');
         if (controls.length > 0) {
            // either plain text or rich text
            controls = controls[0];
            if (window.RTE_GetEditorIFrame && window.RTE_GetEditorIFrame(controls.id) !== null) {
               // rich text field detected
               field = new SPRichNoteField(spFieldParams, controls);
            }
         } else {
            controls = $(spFieldParams.controlsCell).find('input[type="hidden"]');
            // is this an "enhanced rich text field" in sp 2010/2013?
            if (controls.length >= 1) {
               field = new SPEnhancedNoteField(spFieldParams, controls);
            }
         }
         if (null === field) {
            // default to plain text note field (on DispForm there is no way to tell)
            field = new SPPlainNoteField(spFieldParams, controls);
         }
         break;
      case 'SPFieldFile':
         field = new SPFileField(spFieldParams);
         break;
      case 'SPFieldLookupMulti':
         field = new SPLookupMultiField(spFieldParams);
         break;
      default:
         field = new SPField(spFieldParams);
         break;
      }
      return field;
   }
   
   function createSPField(spFieldParams) {
      var field = null;
      try {
         if (null === spFieldParams.controlsCell) {
            // the only time this property will NOT be null is in survey forms
            spFieldParams.controlsCell = $(spFieldParams.labelCell).next()[0];
            // use nextSibling?
         }
         spFieldParams.type = getSPFieldType(spFieldParams.controlsCell);
         
         // if we can't get the type then we can't create the field
         if (null === spFieldParams.type) {
            return null;
         }
         
         field = getSPFieldFromType(spFieldParams);
      } catch (e) {
         throw 'Error creating field named ' + spFieldParams.name + ': ' + e.toString();
      }
      return field;
   }
   
   function getFieldParams(elemTD, surveyElemTD, isSurveyForm) {
      var fieldParams = null, fieldName = 'Unknown field', elemLabel, isRequired;
      try {
         if (isSurveyForm) {
            elemLabel = elemTD;
         } else {
            // navigate TD -> ??
            elemLabel = $(elemTD).children()[0];
            if (null === elemLabel || elemLabel.nodeName === 'NOBR') {
               return null; // attachments row not currently supported
            }
         }
         
         fieldName = $.trim($(elemLabel).text());
         isRequired = fieldName.lastIndexOf(' *') === (fieldName.length - 2);
         
         if (true === isRequired) {
            fieldName = fieldName.substring(0, fieldName.length - 2);
         }
         
         fieldParams = {
            'name': fieldName,
            'label': $(elemLabel),
            'labelRow': $(elemTD.parentNode),
            'labelCell': elemTD,
            'isRequired': isRequired,
            'controlsRow': isUndefined(surveyElemTD) ? null : $(surveyElemTD.parentNode),
            'controlsCell': isUndefined(surveyElemTD) ? null : surveyElemTD,
            'type': null,
            'spField': null
         };
      } catch (e) {
         throw 'getFieldParams error getting parameters for ' + fieldName + ': ' + e.toString();
      }
      return fieldParams;
   }
   
   function lazyLoadSPFields() {
      if (null === _fieldsHashtable) {
         var i, fieldParams,
            fieldElements = $('table.ms-formtable td.ms-formlabel'),
            surveyElements = $('table.ms-formtable td.ms-formbodysurvey'),
            len = fieldElements.length;

         _isSurveyForm = (surveyElements.length > 0);
         _fieldsHashtable = {};
         
         for (i = 0; i < len; i += 1) {
            fieldParams = getFieldParams(fieldElements[i], surveyElements[i], _isSurveyForm);
            if (null !== fieldParams) {
               _fieldsHashtable[fieldParams.name] = fieldParams;
            }
         }
      }
   }
   
   function toggleSPFieldRows(labelRow, controlsRow, bShowField) {
      // controlsRow is populated on survey forms (null otherwise)
      if (bShowField) {
         $(labelRow).show();
         if (null !== controlsRow) {
            $(controlsRow).show();
         }
      } else {
         $(labelRow).hide();
         if (null !== controlsRow) {
            $(controlsRow).hide();
         }
      }
   }
   
   function toggleSPField(strFieldName, bShowField) {
      lazyLoadSPFields();
         
      var fieldParams = _fieldsHashtable[strFieldName];
      
      if (isUndefined(fieldParams)) { 
         throw 'toggleSPField: Unable to find a SPField named ' + strFieldName + ' - ' + bShowField;
      }
      
      toggleSPFieldRows(fieldParams.labelRow, fieldParams.controlsRow, bShowField);
   }
   
   function arrayToSemicolonList(arr) {
      var text = '';
      
      $(arr).each(function (i, elem) {
         text += $(elem).text() + '; ';
      });
      
      if (text.length > 2) {
         text = text.substring(0, text.length - 2);
      }
      
      return text;
   }
   
   /*
    *   SPUtility Classes
   **/
  
   /*
    *   SPField class
    *   Contains all of the common properties and functions used by the specialized
    *   sub-classes. Typically, this should not be intantiated directly.
    */
   function SPField(fieldParams) {
      // Public Properties
      this.Label = fieldParams.label;
      this.LabelRow = fieldParams.labelRow;
      this.Name = fieldParams.name;
      this.IsRequired = fieldParams.isRequired;
      this.Type = fieldParams.type;
      if ($(fieldParams.controlsCell).children().length > 0) {
         this.Controls = $(fieldParams.controlsCell).children()[0];
      } else {
         this.Controls = null;
      }
      this.ControlsRow = fieldParams.controlsRow;
      this.ReadOnlyLabel = null;
   }

   /*
    *   Public SPField Methods
    */
   SPField.prototype.Show = function () {
      toggleSPFieldRows(this.LabelRow, this.ControlsRow, true);
      return this;
   };

   SPField.prototype.Hide = function () {
      toggleSPFieldRows(this.LabelRow, this.ControlsRow, false);
      return this;
   };
   
   // should be called in SetValue to update the read-only label
   SPField.prototype._updateReadOnlyLabel = function (htmlToInsert) {
      if (this.ReadOnlyLabel) {
         this.ReadOnlyLabel.html(htmlToInsert);
      }
   };
   
   // should be called in MakeReadOnly to change a field into read-only mode
   SPField.prototype._makeReadOnly = function (htmlToInsert) {
      try {
         $(this.Controls).hide();
         if (null === this.ReadOnlyLabel) {
            this.ReadOnlyLabel = $('<div/>').addClass('sputility-readonly');
            $(this.Controls).after(this.ReadOnlyLabel);
         }
         this.ReadOnlyLabel.html(htmlToInsert);
         this.ReadOnlyLabel.show();
      } catch (ex) {
         throw 'Error making ' + this.Name + ' read only. ' + ex.toString();
      }
      return this;
   };

   SPField.prototype.MakeReadOnly = function () {
      return this._makeReadOnly(this.GetValue().toString());
   };

   SPField.prototype.MakeEditable = function () {
      try {
         $(this.Controls).show();
         if (null !== this.ReadOnlyLabel) {
            $(this.ReadOnlyLabel).hide();
         }
      } catch (ex) {
         throw 'Error making ' + this.Name + ' editable. ' + ex.toString();
      }
      return this;
   };

   SPField.prototype.toString = function () {
      return this.Name;
   };

   /*
    *   Public SPField Override Methods
    *   All of the below methods need to be implemented in each sub-class
    */
   SPField.prototype.GetValue = function () {
      throw 'GetValue not yet implemented for ' + this.Type + ' in ' + this.Name;
   };

   SPField.prototype.SetValue = function () {
      throw 'SetValue not yet implemented for ' + this.Type + ' in ' + this.Name;
   };

   /*
    *   SPTextField class
    *   Supports Single line of text fields
    */
   function SPTextField(fieldParams) {
      SPField.call(this, fieldParams);
      // public Textbox property
      this.Textbox = getInputControl(this);
   }

   // SPTextField inherits from the SPField base class
   SPTextField.prototype = Object.create(SPField.prototype);

   /*
    *   SPTextField Public Methods
    *   Overrides SPField class methods.
    */
   SPTextField.prototype.GetValue = function () {
      return $(this.Textbox).val();
   };
      
   SPTextField.prototype.SetValue = function (value) {
      $(this.Textbox).val(value);
      this._updateReadOnlyLabel(this.GetValue().toString());
      return this;
   };


   /*
    *   SPNumberField class
    *   Supports Number fields
    */
   function SPNumberField(fieldParams) {
      SPTextField.call(this, fieldParams);
   }

   // SPNumberField inherits from the SPTextField base class
   SPNumberField.prototype = Object.create(SPTextField.prototype);

   /*
    *   SPNumberField Public Methods
    *   Overrides SPTextField class methods.
    */
   SPNumberField.prototype.GetValue = function () {
      return convertStringToNumber($(this.Textbox).val());
   };

   
   /*
    *   SPCurrencyField class
    *   Supports currency fields (SPCurrencyField)
    */
   function SPCurrencyField(fieldParams) {
      SPNumberField.call(this, fieldParams);
      this.FormatOptions = {
         eventHandler: null,
         autoCorrect: false,
         decimalPlaces: 2
      };
   }

   // SPCurrencyField inherits from the SPNumberField base class
   SPCurrencyField.prototype = Object.create(SPNumberField.prototype);

   /*
    *   Overrides SPNumberField class methods.
    */
   SPCurrencyField.prototype.Format = function () {
      if (this.FormatOptions.autoCorrect) {
         this.FormatOptions.eventHandler = $.proxy(function () {
            this.SetValue(this.GetFormattedValue());
         }, this);
         $(this.Textbox).on('change', this.FormatOptions.eventHandler);
         this.FormatOptions.eventHandler(); // run once
      } else {
         if (this.FormatOptions.eventHandler) {
            $(this.Textbox).off('change', this.FormatOptions.eventHandler);
            this.FormatOptions.eventHandler = null;
         }
      }
   };
   
   SPCurrencyField.prototype.GetFormattedValue = function () {
      var text = this.GetValue();
      if (typeof text === "number") {
         text = '$' + formatMoney(text, this.FormatOptions.decimalPlaces);
      }
      return text;
   };
   
   SPCurrencyField.prototype.SetValue = function (value) {
      $(this.Textbox).val(value);
      this._updateReadOnlyLabel(this.GetFormattedValue());
      return this;
   };
   
   // Override the default MakeReadOnly function to allow displaying
   // the value with currency symbols
   SPCurrencyField.prototype.MakeReadOnly = function () {
      return this._makeReadOnly(this.GetFormattedValue());
   };

   /*
   *   SPChoiceField class
   *   Base class for dropdown, radio, and checkbox fields
   */
   function SPChoiceField(fieldParams) {
      SPField.call(this, fieldParams);

      if (this.Controls === null) {
         return;
      }
      
      var controls = $(this.Controls).find('input'), numControls = controls.length;
      if (numControls > 1 && controls[numControls - 1].type === "text") {
         // fill-in textbox is always the last input control
         this.FillInTextbox = controls[numControls - 1];
         // fill-in element (radio or checkbox) is always second to last
         this.FillInElement = controls[numControls - 2];
         this.FillInAllowed = true;
      } else {
         this.FillInAllowed = false;
         this.FillInTextbox = null;
         this.FillInElement = null;
      }
   }

   // Inherit from SPField
   SPChoiceField.prototype = Object.create(SPField.prototype);

   SPChoiceField.prototype._getFillInValue = function () {
      return $(this.FillInTextbox).val();
   };

   SPChoiceField.prototype._setFillInValue = function (value) {
      this.FillInElement.checked = true;
      $(this.FillInTextbox).val(value);
   };

   /*
    *   SPDropdownChoiceField class
    *   Supports single select choice fields that show as a dropdown
    */
   function SPDropdownChoiceField(fieldParams, dropdown) {
      SPChoiceField.call(this, fieldParams);

      if (this.Controls === null) {
         return;
      }

      this.Dropdown = dropdown;
      this.Dropdown = this.Dropdown.length === 1 ? this.Dropdown[0] : [];
   }

   // Inherit from SPChoiceField
   SPDropdownChoiceField.prototype = Object.create(SPChoiceField.prototype);

   SPDropdownChoiceField.prototype.GetValue = function () {
      if (this.FillInAllowed && this.FillInElement.checked === true) {
         return this._getFillInValue();
      }
      return $(this.Dropdown).val();
   };

   SPDropdownChoiceField.prototype.SetValue = function (value) {
      var found = $(this.Dropdown).find('option[value="' + value + '"]').length > 0;
      if (!found && this.FillInAllowed) {
         if (found) {
            $(this.Dropdown).val(value);
            this.FillInElement.checked = false;
         } else {
            this._setFillInValue(value);
         }
      } else if (found) {
         $(this.Dropdown).val(value);
      } else {
         throw 'Unable to set value for ' + this.Name + ' the value "' + value + '" was not found.';
      }
      this._updateReadOnlyLabel(this.GetValue().toString());
      return this;
   };
   
   /*
    *   SPRadioChoiceField class
    *   Supports single select choice fields that show as radio buttons
    */
   function SPRadioChoiceField(fieldParams) {
      SPChoiceField.call(this, fieldParams);

      if (this.Controls === null) {
         return;
      }

      this.RadioButtons = getHashFromInputControls(this, 'input[type="radio"]');
      if (this.FillInAllowed) {
         // remove the last radio button, which is to select fill-in value
         this.RadioButtons.pop();
      }
   }

   // Inherit from SPChoiceField
   SPRadioChoiceField.prototype = Object.create(SPChoiceField.prototype);

   SPRadioChoiceField.prototype.GetValue = function () {
      var value = null;
      // find the radio button we need to get in our hashtable
      $(this.RadioButtons).each(function (index, pair) {
         var radioButton = pair.value;
         if (radioButton.checked) {
            value = pair.key;
            return false;
         }
      });

      if (this.FillInAllowed && value === null && this.FillInElement.checked === true) {
         value = $(this.FillInTextbox).val();
      }

      return value;
   };

   SPRadioChoiceField.prototype.SetValue = function (value) {
      // find the radio button we need to set in our hashtable
      var radioButton = getHashValue(this.RadioButtons, value);

      // if couldn't find the element in the hashtable and fill-in
      // is allowed, assume they want to set the fill-in value
      if (null === radioButton) {
         if (this.FillInAllowed) {
            this._setFillInValue(value);
         } else {
            throw 'Unable to set value for ' + this.Name + ' the value "' + value + '" was not found.';
         }
      } else {
         radioButton.checked = true;
      }
      this._updateReadOnlyLabel(this.GetValue().toString());
      return this;
   };

   /*
   *   SPCheckboxChoiceField class
   *   Supports multi-select choice fields which show as checkboxes
   */
   function SPCheckboxChoiceField(fieldParams) {
      SPChoiceField.call(this, fieldParams);

      if (this.Controls === null) {
         return;
      }

      this.Checkboxes = getHashFromInputControls(this, 'input[type="checkbox"]');

      // when fill-in is allowed, it shows up as an extra checkbox
      // remove it and set the fill-in element because it isn't a normal value
      if (this.FillInAllowed) {
         this.FillInElement = this.Checkboxes.pop().value;
      }
   }

   // Inherit from SPChoiceField
   SPCheckboxChoiceField.prototype = Object.create(SPChoiceField.prototype);
   
   // display as semicolon delimited list
   SPCheckboxChoiceField.prototype.MakeReadOnly = function () {
      return this._makeReadOnly(this.GetValue().join("; "));
   };

   SPCheckboxChoiceField.prototype.GetValue = function () {
      var values = [];
      $(this.Checkboxes).each(function (index, pair) {
         var checkbox = pair.value;
         if (checkbox.checked) {
            values.push(pair.key);
         }
      });
      
      if (this.FillInAllowed && this.FillInElement.checked === true) {
         values.push($(this.FillInTextbox).val());
      }
      
      return values;
   };

   SPCheckboxChoiceField.prototype.SetValue = function (value, isChecked) {
      var checkbox = getHashValue(this.Checkboxes, value);
      isChecked = isUndefined(isChecked) ? true : isChecked;
      
      // if couldn't find the element in the hashtable
      // and fill-in is allowed, assume they meant the fill-in value
      if (null === checkbox) {
         if (this.FillInAllowed) {
            checkbox = this.FillInElement;
            $(this.FillInTextbox).val(value);
            checkbox.checked = true;
         } else {
            throw 'Unable to set value for ' + this.Name + ' the value "' + value + '" was not found.';
         }
      } else {
         checkbox.checked = true;
      }
      this._updateReadOnlyLabel(this.GetValue().join("; "));
      return this;
   };
   
   /*
	 *	SPDateTimeFieldValue class
	 *	Used to set/get values for SPDateTimeField fields
	 */
   function SPDateTimeFieldValue(year, month, day, hour, strMinute) {
      this.Year = year;
      this.Month = month;
      this.Day = day;
      this.IsTimeIncluded = !isUndefined(hour) && !isUndefined(strMinute);
      
      this.Hour = '12 AM';
      this.HourInt = 0;
      this.Minute = '00';

      if (this.IsTimeIncluded) {
         if (isNumber(hour)) {
            if (hour < 0 || hour > 23) {
               throw 'Hour number parameter must be between 0 and 23.';
            }
            this.Hour = this.ConvertHourToString(hour);
            this.HourInt = hour;
         } else if (isString(hour)) {
            if (!this.IsValidHour(hour)) {
               throw 'Hour string parameter must be formatted like "1 PM" or "12 AM".';
            }
            this.Hour = hour;
            this.HourInt = this.ConvertHourToNumber(hour);
         }
         
         if (!this.IsValidMinute(strMinute)) {
            throw 'Minute parameter is not in the correct format. Needs to be formatted like "00", "05" or "35".';
         }
         this.Minute = strMinute;
      }
   }
		
   /*
    *	SPDateTimeFieldValue Public Methods
    */

   SPDateTimeFieldValue.prototype.IsValidDate = function () {
      return !isUndefined(this.Year) && !isUndefined(this.Month) && !isUndefined(this.Day);
   };

   SPDateTimeFieldValue.prototype.IsValidHour = function (h) {
      return !isUndefined(h) && (/^([1-9]|10|11|12) (AM|PM)$/).test(h);
   };

   SPDateTimeFieldValue.prototype.IsValidMinute = function (m) {
      return !isUndefined(m) && (/^([0-5](0|5))$/).test(m);
   };
   
   SPDateTimeFieldValue.prototype.ConvertHourToString = function (num) {
      var hour;
      if (num === 0) {
         hour = '12 AM';
      } else if (num > 12) {
         hour = (num - 12).toString() + ' PM';
      } else {
         hour = num.toString() + ' AM';
      }
      return hour;
   };
   
   SPDateTimeFieldValue.prototype.ConvertHourToNumber = function (str) {
      var hour;
      str = str.split(' ');
      hour = getInteger(str[0]);
      if (str[1] === 'AM') {
         if (hour === 12) {
            hour = 0;
         }
      } else if (str[1] === 'PM') {
         hour += 12;
      }
      return hour;
   };

   // returns the part of a date as a string and pads with a 0 if necessary
   SPDateTimeFieldValue.prototype.PadWithZero = function (d) {
      if (isUndefined(d) || null === d) {
         return '';
      }
      if (isString(d)) {
         d = getInteger(d);
         if (isNaN(d)) {
            return '';
         }
      }
      if (typeof d === 'number' && d < 10) {
         return '0' + d.toString();
      }
      return d.toString();
   };

   // transforms a date object into a string
   SPDateTimeFieldValue.prototype.GetShortDateString = function () {
      if (!this.IsValidDate()) {
         return '';
      }
      var strDate = this.PadWithZero(this.Month) + "/" +
         this.PadWithZero(this.Day) + "/" +
         this.PadWithZero(this.Year);
      return strDate;
   };

   SPDateTimeFieldValue.prototype.toString = function () {
      var str = this.GetShortDateString(), arrHour;
      if (this.IsTimeIncluded && this.IsValidHour(this.Hour) && this.IsValidMinute(this.Minute)) {
         arrHour = this.Hour.split(' ');
         str += ' ' + arrHour[0] + ':' + this.Minute + arrHour[1];
      }
      return str;
   };
   
   function SPDateTimeField(fieldParams) {
      SPField.call(this, fieldParams);
      this.DateTextbox = getInputControl(this);
			
      this.HourDropdown = null;
      this.MinuteDropdown = null;
      this.IsDateOnly = true;
      this.HourValueFormat = null;

      if (this.Controls === null) {
         return;
      }

      var timeControls = $(this.Controls).find('select');
      if (null !== timeControls && 2 === timeControls.length) {
         this.HourDropdown = timeControls[0];
         if ($(this.HourDropdown).val().indexOf(' ') > -1) {
            this.HourValueFormat = 'string';
         } else {
            this.HourValueFormat = 'number';
         }
         this.MinuteDropdown = timeControls[1];
         this.IsDateOnly = false;
      }
   }
   
   // Inherit from SPField
   SPDateTimeField.prototype = Object.create(SPField.prototype);

   SPDateTimeField.prototype.GetValue = function () {
      var hour, strMinute, arrShortDate = $(this.DateTextbox).val().split('/');

      if (!this.IsDateOnly) {
         hour = $(this.HourDropdown).val();
         if (this.HourValueFormat === 'number') {
            hour = getInteger(hour);
         }
         strMinute = $(this.MinuteDropdown).val();
      }
      
      if (arrShortDate.length === 3) {
         return new SPDateTimeFieldValue(arrShortDate[2], arrShortDate[0], arrShortDate[1], hour, strMinute);
      }

      // empty or invalid date
      return '';
   };
		
   SPDateTimeField.prototype.SetValue = function (year, month, day, hour, strMinute) {
      var value = new SPDateTimeFieldValue(year, month, day, hour, strMinute);
      $(this.DateTextbox).val(value.GetShortDateString());
      if (null !== this.HourDropdown && null !== this.MinuteDropdown) {
         // is the hour dropdown values in string or number format
         // ex: 12 AM versus 0, 1 AM versus 1, etc.
         if (this.HourValueFormat === 'string') {
            $(this.HourDropdown).val(value.Hour);
         } else {
            $(this.HourDropdown).val(value.HourInt);
         }
         
         $(this.MinuteDropdown).val(value.Minute);
      }
      this._updateReadOnlyLabel(this.GetValue().toString());
      return this;
   };
   
   /*
	 *	SPBooleanField class
	 *	Supports yes/no fields (SPFieldBoolean)
	 */
   function SPBooleanField(fieldParams) {
      SPField.call(this, fieldParams);
      this.Checkbox = $(getInputControl(this));
   }
   
   // Inherit from SPField
   SPBooleanField.prototype = Object.create(SPField.prototype);

   /*
    *	SPBooleanField Public Methods
    *	Overrides SPField class methods.
    */
   SPBooleanField.prototype.GetValue = function () {
      // double negative to return a boolean value
      return !!this.Checkbox.val();
   };

   SPBooleanField.prototype.SetValue = function (value) {
      this.Checkbox.val(value);
      this._updateReadOnlyLabel(this.GetValue().toString());
      return this;
   };
   
   /*
	 *	SPURLField class
	 *	Supports hyperlink fields (SPFieldURL)
	 */
   function SPURLField(fieldParams) {
      SPField.call(this, fieldParams);
      if (this.Controls === null) {
         return;
      }

      this.TextboxURL = null;
      this.TextboxDescription = null;
      this.TextOnly = false;

      var controls = $(this.Controls).find('input');
      if (null !== controls && 2 === controls.length) {
         this.TextboxURL = $(controls[0]);
         this.TextboxDescription = $(controls[1]);
      }
   }
   
   // Inherit from SPField
   SPURLField.prototype = Object.create(SPField.prototype);
		
   /*
    *	SPURLField Public Methods
    *	Overrides SPField class methods.
    */
   SPURLField.prototype.GetValue = function () {
      return [this.TextboxURL.val(), this.TextboxDescription.val()];
   };

   SPURLField.prototype.SetValue = function (url, description) {
      this.TextboxURL.val(url);
      this.TextboxDescription.val(description);
      this._updateReadOnlyLabel(this.GetHyperlink());
      return this;
   };
   
   SPURLField.prototype.GetHyperlink = function () {
      var values = this.GetValue();
      var hyperlink;
      if (this.TextOnly) {
         hyperlink = values[0] + ', ' + values[1];
      } else {            
         hyperlink = '<a href="' + values[0] + '">' + values[1] + '</a>';
      }
      return hyperlink;
   };

   // overriding the default MakeReadOnly function because we have multiple values returned
   // and we want to have the hyperlink field show up as a URL
   SPURLField.prototype.MakeReadOnly = function (options) {
      if (options && true === options.TextOnly) {
         this.TextOnly = true;
      }

      return this._makeReadOnly(this.GetHyperlink());
   };
   
   /*
	 *	SPDropdownLookupField class
	 *	Supports single select lookup fields
	 */
   function SPDropdownLookupField(fieldParams, elemSelect) {
      SPField.call(this, fieldParams);
      if (this.Controls === null) {
         return;
      }
      
      if (1 === elemSelect.length) {
         // regular dropdown lookup
         this.Dropdown = elemSelect[0];
      } else {
         throw "Unable to get dropdown element for " + this.Name;
      }
   }
   
   // Inherit from SPField
   SPDropdownLookupField.prototype = Object.create(SPField.prototype);
   
   SPDropdownLookupField.prototype.GetValue = function () {
      return this.Dropdown.options[this.Dropdown.selectedIndex].text;
   };

   SPDropdownLookupField.prototype.SetValue = function (value) {
      if (isNumber(value)) {
         $(this.Dropdown).val(value);
      } else {
         var i, options, option;
         // need to set the dropdown based on text
         options = this.Dropdown.options;
         for (i = 0; i < options.length; i += 1) {
            option = options[i];
            if (option.text === value) {
               this.Dropdown.selectedIndex = i;
               break;
            }
         }
      }
      this._updateReadOnlyLabel(this.GetValue());
      return this;
   };
   
   /*
	 *	SPDropdownLookupField class
	 *	Supports single select lookup fields
	 */
   function SPAutocompleteLookupField(fieldParams, elemInputs) {
      SPField.call(this, fieldParams);
      if (this.Controls === null) {
         return;
      }
      
      if (1 === elemInputs.length) {
         // autocomplete lookup
         this.Textbox = $(elemInputs[0]);
         this.HiddenTextbox = $('input[id="' + this.Textbox.attr('optHid') + '"]');
      } else {
         throw "Unable to get input elements for " + this.Name;
      }
   }
   
   // Inherit from SPField
   SPAutocompleteLookupField.prototype = Object.create(SPField.prototype);
   
   SPAutocompleteLookupField.prototype.GetValue = function () {
      return this.Textbox.val();
   };

   SPAutocompleteLookupField.prototype.SetValue = function (value) {
      var choices, lookupID, lookupText, i, c = [], pipeIndex;

      // a list item ID was passed to the function so attempt to lookup the text value
      choices = this.Textbox.attr('choices');
      
      // options are stored in a choices attribute in the following format:
      // (None)|0|Alpha|1|Bravo|2|Charlie|3
      // split the string on every pipe character followed by a digit
      choices = choices.split(/\|(?=\d+)/);
      c.push(choices[0]);
      for (i = 1; i < choices.length - 1; i++) {
         pipeIndex = choices[i].indexOf('|'); // split on the first pipe only
         c.push(choices[i].substring(0, pipeIndex));
         c.push(choices[i].substring(pipeIndex + 1));
      }
      c.push(choices[choices.length - 1]);
      
      if (isString(value)) {
         // since the pipe character is used as a delimiter above, any values
         // which have a pipe in them were doubled up
         value = value.replace("|", "||");
      }
      
      // options are stored in a choices attribute in the following format:
      // text|value|text 2|value2
      for (i = 0; i < c.length; i += 2) {
         lookupID = getInteger(c[i + 1]);
         lookupText = c[i];
         // if value is an integer, assume they are passing the list item ID
         // otherwise, a string will match the text value
         if (value === lookupID || value === lookupText) {
            this.Textbox.val(lookupText.replace("||", "|"));
            break;
         }
      }

      if (null !== lookupID) {
         this.HiddenTextbox.val(lookupID);
      }

      this._updateReadOnlyLabel(this.GetValue());
      return this;
   };
   
   /*
	 *	SPPlainNoteField class
	 *	Supports multi-line plain text fields (SPFieldNote)
	 */
   function SPPlainNoteField(fieldParams, textarea) {
      SPField.call(this, fieldParams);
      this.Textbox = textarea;
      this.TextType = "Plain";
   }
   
   // Inherit from SPField
   SPPlainNoteField.prototype = Object.create(SPField.prototype);
   
   SPPlainNoteField.prototype.GetValue = function () {
      return $(this.Textbox).val();
   };

   SPPlainNoteField.prototype.SetValue = function (value) {
      $(this.Textbox).val(value);
      this._updateReadOnlyLabel(this.GetValue());
      return this;
   };
   
   /*
	 *	SPRichNoteField class
	 *	Supports multi-line rich text fields (SPFieldNote)
	 */
   function SPRichNoteField(fieldParams, textarea) {
      SPPlainNoteField.call(this, fieldParams, textarea);
      this.TextType = "Rich";
   }
   
   // Inherit from SPField
   SPRichNoteField.prototype = Object.create(SPPlainNoteField.prototype);
   
   // RTE functions are defined in layouts/1033/form.js
   SPRichNoteField.prototype.GetValue = function () {
      return window.RTE_GetIFrameContents(this.Textbox.id);
   };

   SPRichNoteField.prototype.SetValue = function (value) {
      $(this.Textbox).val(value);
      window.RTE_TransferTextAreaContentsToIFrame(this.Textbox.id);
      this._updateReadOnlyLabel(this.GetValue());
      return this;
   };
   
   /*
	 *	SPEnhancedNoteField class
	 *	Supports multi-line, enhanced rich text fields in SharePoint 2010/2013 (SPFieldNote)
	 */
   function SPEnhancedNoteField(fieldParams, hiddenInputs) {
      SPField.call(this, fieldParams);
      this.Textbox = hiddenInputs[0];
      this.ContentDiv = $(this.Controls).find('div[contenteditable="true"]')[0];
      this.TextType = "Enhanced";
   }
   
   // Inherit from SPField
   SPEnhancedNoteField.prototype = Object.create(SPField.prototype);
   
   SPEnhancedNoteField.prototype.GetValue = function () {
      return $(this.ContentDiv).html();
   };

   SPEnhancedNoteField.prototype.SetValue = function (value) {
      $(this.ContentDiv).html(value);
      $(this.Textbox).val(value);
      this._updateReadOnlyLabel(this.GetValue());
      return this;
   };
   
   /*
	 *	SPFileField class
	 *	Supports the name field of a Document Library
	 */
   function SPFileField(fieldParams) {
      SPTextField.call(this, fieldParams);
      this.FileExtension = $(this.Textbox).parent().text();
   }
   
   // Inherit from SPTextField
   SPFileField.prototype = Object.create(SPTextField.prototype);

   /*
    *	SPFileField Public Methods
    *	Overrides SPTextField class methods.
    */
   SPFileField.prototype.GetValue = function () {
      return $(this.Textbox).val() + this.FileExtension;
   };
   
   /*
	 *	SPLookupMultiField class
	 *	Supports multi select lookup fields
	 */
   function SPLookupMultiField(fieldParams) {
      SPField.call(this, fieldParams);
      if (this.Controls === null) {
         return;
      }

      var controls = $(this.Controls).find('select');
      if (2 === controls.length) {
         // multi-select lookup
         this.ListChoices = controls[0];
         this.ListSelections = controls[1];
         controls = $(this.Controls).find('button');
         if (controls.length === 0) {
            controls = $(this.Controls).find('input[type="button"]');
         }
         this.ButtonAdd = controls[0];
         this.ButtonRemove = controls[1];
      } else {
         throw "Error initializing SPLookupMultiField named " + this.Name + ", unable to get select controls.";
      }
   }
   
   // Inherit from SPField
   SPLookupMultiField.prototype = Object.create(SPField.prototype);
   
   SPLookupMultiField.prototype.GetValue = function () {
      var values = [], i, numOptions;

      numOptions = this.ListSelections.options.length;
      for (i = 0; i < numOptions; i += 1) {
         values.push(this.ListSelections.options[i].text);
      }

      return values;
   };

   // display as semicolon delimited list
   SPLookupMultiField.prototype.MakeReadOnly = function () {
      return this._makeReadOnly(this.GetValue().join("; "));
   };

   SPLookupMultiField.prototype.SetValue = function (value, addValue) {
      if (isUndefined(addValue)) {
         addValue = true;
      }

      var i, option, options, numOptions, button, prop;

      if (addValue) {
         options = this.ListChoices.options;
         button = this.ButtonAdd;
      } else {
         options = this.ListSelections.options;
         button = this.ButtonRemove;
      }

      numOptions = options.length;

      // select the value
      if (isNumber(value)) {
         value = value.toString();
         prop = "value";
      } else {
         prop = "text";
      }
      
      for (i = 0; i < numOptions; i += 1) {
         option = options[i];

         if (option[prop] === value) {
            option.selected = true;
         } else {
            option.selected = false;
         }
      }

      // the button may be disabled if this is the second time
      // we are performing a certain operation
      button.disabled = "";

      // add or remove the value
      $(button).click();

      this._updateReadOnlyLabel(this.GetValue().join("; "));
      return this;
   };
   
   /*
	 *	SPUserField class
	 *	Supports people fields (SPFieldUser)
	 */
   function SPUserField(fieldParams) {
      SPField.call(this, fieldParams);
      
      if (this.Controls === null) {
         return;
      }

      this.spanUserField = null;
      this.upLevelDiv = null;
      this.textareaDownLevelTextBox = null;
      this.linkCheckNames = null;
      this.txtHiddenSpanData = null;

      var controls = $(this.Controls).find('span.ms-usereditor');
      if (null !== controls && 1 === controls.length) {
         this.spanUserField = controls[0];
         this.upLevelDiv = $(this.spanUserField.id + '_upLevelDiv');
         this.textareaDownLevelTextBox = $(this.spanUserField.id + '_downlevelTextBox');
         this.linkCheckNames = $(this.spanUserField.id + '_checkNames');
         this.txtHiddenSpanData = $(this.spanUserField.id + '_hiddenSpanData');
         this.GetValue = function () {
            //this.textareaDownLevelTextBox.getValue()
            return this.upLevelDiv.text();
         };

         this.SetValue = function (value) {
            if ($.browser.msie) {
               this.upLevelDiv.innerHTML = value;
               this.txtHiddenSpanData.val(value);
               this.linkCheckNames.click();
            } else { // FireFox (maybe others?)
               this.textareaDownLevelTextBox.val(value);
               this.linkCheckNames.onclick();
            }
            this._updateReadOnlyLabel(this.GetValue());
            return this;
         };
      } else if (!isUndefined(window.SPClientPeoplePicker)) {
         // sharepoint 2013 uses a special autofill named SPClientPeoplePicker
         // _layouts/15/clientpeoplepicker.debug.js
         var pickerDiv = $(this.Controls).children()[0];
         this.ClientPeoplePicker = window.SPClientPeoplePicker.SPClientPeoplePickerDict[$(pickerDiv).attr('id')];
         this.EditorInput = $(this.Controls).find("[id$='_EditorInput']")[0];
         this.HiddenInput = $(this.Controls).find("[id$='_HiddenInput']")[0];
         this.AutoFillDiv = $(this.Controls).find("[id$='_AutoFillDiv']")[0];
         this.ResolvedList = $(this.Controls).find("[id$='_ResolvedList']")[0];
         //$('.sp-peoplepicker-userSpan')
         this.GetValue = function () {
            // look for any entries that have been resolved
            var peopleSpans = $(this.ResolvedList).find('span.ms-entity-resolved');
            if (peopleSpans.length > 0) {
               return arrayToSemicolonList(peopleSpans);
            }
            return '';
         };
         this.SetValue = function (value) {
            this.ClientPeoplePicker.AddUserKeys(value, false);
            this._updateReadOnlyLabel(this.GetValue());
            return this;
         };
      }
   }
   
   // Inherit from SPField
   SPUserField.prototype = Object.create(SPField.prototype);


   /**
    *   SPUtility Global object and Public Methods
   **/
   var SPUtility = {};
   SPUtility.Debug = function () {
      // Debug method has been deprecated in favor of
      // exceptions being thrown from the library
      // Catch the exception, then use console.log or alert
      return false;
   };
   
   // Searches the page for a specific field by name
   SPUtility.GetSPField = function (strFieldName) {
      lazyLoadSPFields();
      
      var fieldParams = _fieldsHashtable[strFieldName];
      
      if (isUndefined(fieldParams)) { 
         throw 'Unable to get a SPField named ' + strFieldName;
      }
      
      if (fieldParams.spField === null) {
         // field hasn't been initialized yet
         fieldParams.spField = createSPField(fieldParams);
      }
      
      return fieldParams.spField;
   };

   // Gets all of the SPFields on the page
   SPUtility.GetSPFields = function () {
      lazyLoadSPFields();
      return _fieldsHashtable;
   };
   
   SPUtility.HideSPField = function (strFieldName) {
      toggleSPField(strFieldName, false);
   };
   
   SPUtility.ShowSPField = function (strFieldName) {
      toggleSPField(strFieldName, true);
   };

   return SPUtility;
}(jQuery));
