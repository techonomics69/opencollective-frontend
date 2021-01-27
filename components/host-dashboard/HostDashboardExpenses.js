import React from 'react';
import PropTypes from 'prop-types';
import { useQuery } from '@apollo/client';
import { mapValues, omit } from 'lodash';
import { useRouter } from 'next/router';
import { FormattedMessage } from 'react-intl';

import EXPENSE_STATUS from '../../lib/constants/expense-status';
import { API_V2_CONTEXT, gqlV2 } from '../../lib/graphql/helpers';

import { parseAmountRange } from '../budget/filters/AmountFilter';
import { getDateRangeFromPeriod } from '../budget/filters/PeriodFilter';
import DismissibleMessage from '../DismissibleMessage';
import ExpensesFilters from '../expenses/ExpensesFilters';
import ExpensesList from '../expenses/ExpensesList';
import {
  expenseHostFields,
  expensesListAdminFieldsFragment,
  expensesListFieldsFragment,
} from '../expenses/graphql/fragments';
import { Box, Flex } from '../Grid';
import Link from '../Link';
import LoadingPlaceholder from '../LoadingPlaceholder';
import MessageBox from '../MessageBox';
import MessageBoxGraphqlError from '../MessageBoxGraphqlError';
import Pagination from '../Pagination';
import SearchBar from '../SearchBar';
import StyledHr from '../StyledHr';
import { H1 } from '../Text';

import HostInfoCard, { hostInfoCardFields } from './HostInfoCard';

const hostDashboardExpensesQuery = gqlV2/* GraphQL */ `
  query HostDashboardExpenses(
    $hostSlug: String!
    $limit: Int!
    $offset: Int!
    $type: ExpenseType
    $tags: [String]
    $status: ExpenseStatusFilter
    $minAmount: Int
    $maxAmount: Int
    $payoutMethodType: PayoutMethodType
    $dateFrom: ISODateTime
    $searchTerm: String
  ) {
    host(slug: $hostSlug) {
      ...ExpenseHostFields
      ...HostInfoCardFields
    }
    expenses(
      host: { slug: $hostSlug }
      limit: $limit
      offset: $offset
      type: $type
      tags: $tags
      status: $status
      minAmount: $minAmount
      maxAmount: $maxAmount
      payoutMethodType: $payoutMethodType
      dateFrom: $dateFrom
      searchTerm: $searchTerm
    ) {
      totalCount
      offset
      limit
      nodes {
        ...ExpensesListFieldsFragment
        ...ExpensesListAdminFieldsFragment
        account {
          id
          name
          slug
          currency
          type
          stats {
            balance {
              valueInCents
            }
          }
        }
      }
    }
  }

  ${expensesListFieldsFragment}
  ${expensesListAdminFieldsFragment}
  ${expenseHostFields}
  ${hostInfoCardFields}
`;

const EXPENSES_PER_PAGE = 15;

const isValidStatus = status => {
  return Boolean(status === 'READY_TO_PAY' || EXPENSE_STATUS[status]);
};

const getVariablesFromQuery = query => {
  const amountRange = parseAmountRange(query.amount);
  const [dateFrom] = getDateRangeFromPeriod(query.period);
  return {
    offset: parseInt(query.offset) || 0,
    limit: parseInt(query.limit) || EXPENSES_PER_PAGE,
    status: isValidStatus(query.status) ? query.status : null,
    type: query.type,
    tags: query.tag ? [query.tag] : undefined,
    minAmount: amountRange[0] && amountRange[0] * 100,
    maxAmount: amountRange[1] && amountRange[1] * 100,
    payoutMethodType: query.payout,
    dateFrom,
    searchTerm: query.searchTerm,
  };
};

const HostDashboardExpenses = ({ hostSlug }) => {
  const { query } = useRouter() || {};
  const [paypalPreApprovalError, setPaypalPreApprovalError] = React.useState(null);
  const { data, error, loading, variables, refetch } = useQuery(hostDashboardExpensesQuery, {
    variables: { hostSlug, ...getVariablesFromQuery(query) },
    context: API_V2_CONTEXT,
  });
  const hasFilters = React.useMemo(
    () =>
      Object.entries(query).some(([key, value]) => {
        return !['view', 'offset', 'limit', 'hostCollectiveSlug', 'paypalApprovalError'].includes(key) && value;
      }),
    [query],
  );

  React.useEffect(() => {
    if (query.paypalApprovalError && !paypalPreApprovalError) {
      setPaypalPreApprovalError(query.paypalApprovalError);
      query.replace({
        pathname: '/host.dashboard',
        query: omit(query, 'paypalApprovalError'),
        options: { shallow: true },
      });
    }
  }, [query.paypalApprovalError]);

  return (
    <Box maxWidth={1000} m="0 auto" px={2}>
      <Flex>
        <H1 fontSize="32px" lineHeight="40px" mb={24} py={2} fontWeight="normal">
          <FormattedMessage id="section.expenses.title" defaultMessage="Expenses" />
        </H1>
        <Box mx="auto" />
        <Box p={2}>
          <SearchBar
            defaultValue={query.searchTerm}
            onSubmit={searchTerm =>
              query.push({ pathname: '/host.dashboard', query: { ...query, searchTerm, offset: null } })
            }
          />
        </Box>
      </Flex>
      <StyledHr mb={26} borderWidth="0.5px" borderColor="black.300" />
      {paypalPreApprovalError && (
        <DismissibleMessage>
          {({ dismiss }) => (
            <MessageBox type="warning" mb={3} withIcon onClose={dismiss}>
              {paypalPreApprovalError === 'PRE_APPROVAL_EMAIL_CHANGED' ? (
                <FormattedMessage
                  id="paypal.preApproval.emailWarning"
                  defaultMessage="Warning: the PayPal email for this account just changed from {oldEmail} to {newEmail}. If it's not the change you intended to do, you can click on {refillBalance} and choose a different one"
                  values={{
                    oldEmail: <strong>{query.oldPaypalEmail}</strong>,
                    newEmail: <strong>{query.newPaypalEmail}</strong>,
                    refillBalance: (
                      <q>
                        <FormattedMessage id="ConnectPaypal.refill" defaultMessage="Refill balance" />
                      </q>
                    ),
                  }}
                />
              ) : (
                paypalPreApprovalError
              )}
            </MessageBox>
          )}
        </DismissibleMessage>
      )}
      <Box mb={4}>
        {loading ? (
          <LoadingPlaceholder height={150} />
        ) : error ? (
          <MessageBoxGraphqlError error={error} />
        ) : (
          <HostInfoCard host={data.host} />
        )}
      </Box>
      <Box mb={34}>
        {data?.host ? (
          <ExpensesFilters
            collective={data.host}
            filters={query}
            onChange={queryParams =>
              query.push({
                pathname: '/host.dashboard',
                query: {
                  ...query,
                  ...queryParams,
                  offset: null,
                },
              })
            }
          />
        ) : loading ? (
          <LoadingPlaceholder height={70} />
        ) : null}
      </Box>
      {error ? null : !loading && !data.expenses?.nodes.length ? (
        <MessageBox type="info" withIcon data-cy="zero-expense-message">
          {hasFilters ? (
            <FormattedMessage
              id="ExpensesList.Empty"
              defaultMessage="No expense matches the given filters, <ResetLink>reset them</ResetLink> to see all expenses."
              values={{
                ResetLink(text) {
                  return (
                    <Link
                      data-cy="reset-expenses-filters"
                      route="host.dashboard"
                      params={{
                        ...mapValues(query, () => null),
                        hostCollectiveSlug: data.host.slug,
                        view: 'expenses',
                      }}
                    >
                      {text}
                    </Link>
                  );
                },
              }}
            />
          ) : (
            <FormattedMessage id="expenses.empty" defaultMessage="No expenses" />
          )}
        </MessageBox>
      ) : (
        <React.Fragment>
          <ExpensesList
            isLoading={loading}
            nbPlaceholders={variables.limit}
            host={data?.host}
            expenses={data?.expenses?.nodes}
            view="admin"
            usePreviewModal
            onDelete={() => refetch()}
            onProcess={() => hasFilters && refetch()}
          />
          <Flex mt={5} justifyContent="center">
            <Pagination
              route="host.dashboard"
              total={data?.expenses?.totalCount}
              limit={variables.limit}
              offset={variables.offset}
              scrollToTopOnChange
            />
          </Flex>
        </React.Fragment>
      )}
    </Box>
  );
};

HostDashboardExpenses.propTypes = {
  hostSlug: PropTypes.string.isRequired,
};

export default HostDashboardExpenses;
