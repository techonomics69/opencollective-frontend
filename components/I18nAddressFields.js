/** This component aims to create a responsive address form based on the user's country that they select.
 * Shopify has a good article about internationalising address forms: https://ux.shopify.com/designing-address-forms-for-everyone-everywhere-f481f6baf513
 * And they also have an API and npm package to tell you what address fields a country uses, and in what order https://github.com/Shopify/quilt/tree/master/packages/address
 * Additional material:
 * Shopify API country codes ("ISO 3166-1 alpha-2 country codes with some differences"): https://shopify.dev/docs/admin-api/graphql/reference/common-objects/countrycode
 * Shopify locale code uses ISO locale codes: https://shopify.dev/docs/admin-api/graphql/reference/translations/locale
 * How Etsy Localizes addresses https://codeascraft.com/2018/09/26/how-etsy-localizes-addresses/
 * Form i18n techniques https://medium.com/flexport-design/form-internationalization-techniques-3e4d394cd7e5 */

import React, { Fragment } from 'react';
import PropTypes from 'prop-types';
import AddressFormatter from '@shopify/address';
import { Field, useFormikContext } from 'formik';
import { get, isEmpty, orderBy, pick, truncate } from 'lodash';
import memoizeOne from 'memoize-one';

import LoadingPlaceholder from './LoadingPlaceholder';
import StyledInput from './StyledInput';
import StyledInputField from './StyledInputField';
import StyledSelect from './StyledSelect';

/** Constants */

/** Countries present in InputTypeCountry dropdown but not Shopify's API.
 * All except Antarctica (AQ) are U.S. territories and use that address format.
 * The Shopify default address format is also U.S. format therefore for all
 * of these we use the U.S. default.
 * All language codes in locales.js are supported by the Shopify API 👍
 */
const missingCountries = ['AS', 'AQ', 'GU', 'MH', 'FM', 'MP', 'PW', 'PR', 'VI'];
const addressFormatter = new AddressFormatter('EN');

const wrangleAddressData = addressInfo => {
  const formLayout = addressInfo.formatting.edit;
  const necessaryFields = ['address1', 'address2', 'city', 'zip', 'province'];

  // Get form fields in correct order for the chosen country
  const matches = formLayout.match(/([A-Za-z])\w+/g).filter(match => necessaryFields.includes(match));

  // Change field names to match https://github.com/Shopify/quilt/blob/master/packages/address/src/utilities.ts
  const mappedMatches = matches.map(match => {
    if (match === 'zip') {
      return 'postalCode';
    } else if (match === 'province') {
      return 'zone';
    } else {
      return match;
    }
  });

  const addressFormFields = Object.entries(addressInfo.labels)
    .filter(entry => mappedMatches.includes(entry[0]))
    .sort((a, b) => {
      return mappedMatches.indexOf(a[0]) - mappedMatches.indexOf(b[0]);
    });

  // Check if we need to render drop-down list of "zones" (i.e. provinces, states, etc.)
  const zones = get(addressInfo, 'zones', []);
  if (mappedMatches.includes('zone') && !isEmpty(zones)) {
    const zoneIndex = addressFormFields.find(idx => idx[0] === 'zone');
    zoneIndex.push(addressInfo.zones);
  }

  return addressFormFields;
};

/** Checks if the key from labels is also present in optionalLabels */
const isFieldOptional = (addressInfo, fieldName) => {
  return !Object.keys(addressInfo.optionalLabels).includes(fieldName);
};

/** Component to be used in forms that require addresses that need some validation
 * i.e. Expenses and Contributions. Must be used with Formik. */
const I18nAddressFields = ({ selectedCountry }) => {
  const formik = useFormikContext();

  /** Pass user's chosen locale (from the footer language selection, stored in browser cookies)
   * to AddressFormatter if present. */
  if (document.cookie.includes('language')) {
    const cookieValue = document.cookie
      .split('; ')
      .find(row => row.startsWith('language'))
      .split('=')[1]
      .toUpperCase();
    addressFormatter.updateLocale(cookieValue);
  }

  /** If country chosen from InputTypeCountry is one of missingCountries, use 'US' instead */
  const country = missingCountries.includes(selectedCountry) ? 'US' : selectedCountry;

  /** Prepare the address form data */
  const [data, setData] = React.useState(null);
  const [fields, setFields] = React.useState(null);

  React.useEffect(() => {
    // TODO: add error handling and default address form
    const fetchData = async () => {
      const countryInfo = await addressFormatter.getCountry(country);
      setData(pick(countryInfo, ['formatting', 'labels', 'optionalLabels', 'zones']));
    };

    fetchData();
  }, [selectedCountry]);

  React.useEffect(() => {
    if (data) {
      const addressFields = wrangleAddressData(data);
      setFields(addressFields);
    }
  }, [data]);

  if (!selectedCountry || !data || !fields) {
    return <LoadingPlaceholder width="100%" height={163} />;
  }

  // Zone select
  const getZoneLabel = zone => {
    return `${truncate(zone.name, { length: 30 })} - ${zone.code}`;
  };

  const getZoneSelectOptions = memoizeOne(zones => {
    const options = zones.map(zone => ({
      value: zone.name,
      label: getZoneLabel(zone),
    }));

    return orderBy(options, 'label');
  });

  // TODO: change tests looks for 'data-cy: payee-address'

  return (
    <Fragment>
      {fields.map(addressField => (
        <Fragment key={addressField[0]}>
          {addressField[0] === 'zone' ? (
            <Field
              name={`payeeLocation.address.${addressField[0]}`}
              formik={formik}
              //validate={someValidationFunc}
            >
              {({ field }) => (
                <StyledInputField
                  name={field.name}
                  //htmlFor=
                  //error=
                  label={addressField[1]}
                  labelFontSize="13px"
                  mt={3}
                  required={isFieldOptional(data, addressField[0])}
                >
                  {({ id }) => (
                    <StyledSelect
                      inputId={id}
                      minWidth={150}
                      options={getZoneSelectOptions(addressField[2])}
                      placeholder={`Please select your ${addressField[1]}`}
                      onChange={({ value }) => {
                        formik.setFieldValue(field.name, value);
                      }}
                    />
                  )}
                </StyledInputField>
              )}
            </Field>
          ) : (
            <Field
              name={`payeeLocation.address.${addressField[0]}`}
              formik={formik}
              //validate={someValidationFunc}
            >
              {({ field }) => (
                <StyledInputField
                  name={field.name}
                  //htmlFor=
                  //error=
                  label={addressField[1]}
                  labelFontSize="13px"
                  mt={3}
                  required={isFieldOptional(data, addressField[0])}
                >
                  {inputProps => <StyledInput {...inputProps} {...field} />}
                </StyledInputField>
              )}
            </Field>
          )}
        </Fragment>
      ))}
    </Fragment>
  );
};

I18nAddressFields.propTypes = {
  /** ISO country code passed down from ExpenseFormPayeeStep. */
  selectedCountry: PropTypes.string.isRequired,
};

export default I18nAddressFields;
