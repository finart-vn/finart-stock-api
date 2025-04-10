import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as _ from 'lodash';

@Injectable()
export class VciExtendService {
  private readonly logger = new Logger(VciExtendService.name);

  // Constants from VCI const.js
  private readonly BASE_URL = 'https://trading.vietcap.com.vn';
  private readonly GRAPHQL_URL = this.BASE_URL + '/data-mt/graphql';

  // Industry to company type code mapping from VCI const.js
  private readonly ICB4_COMTYPE_CODE_MAP = {
    // ... existing map ...
  };

  /**
   * Fetches partial industry data by specific industry name or code
   *
   * @param options Configuration options for the partial fetch
   * @param options.industryName Optional industry name to filter by
   * @param options.fields Optional array of fields to include in the response
   * @returns Filtered industry data
   */
  async getPartialIndustryData(
    options: {
      industryName?: string;
      fields?: string[];
    } = {},
  ) {
    try {
      // Default fields if none provided
      const fields = options.fields || [
        'ticker',
        'organName',
        'icbName4',
        'comTypeCode',
      ];

      // Build the GraphQL query with requested fields
      const fieldsString = fields.join('\n    ');
      const query = `{
        CompaniesListingInfo {
          ${fieldsString}
          __typename
        }
      }`;

      this.logger.log(
        `Fetching partial industry data with fields: ${fields.join(', ')}`,
      );

      try {
        // Make the GraphQL request
        const response = await axios.post(
          this.GRAPHQL_URL,
          {
            query: query,
          },
          {
            timeout: 5000,
            headers: { 'Content-Type': 'application/json' },
          },
        );

        const companiesInfo = _.get(
          response,
          'data.data.CompaniesListingInfo',
          [],
        );

        if (companiesInfo.length > 0) {
          // Filter by industry name if provided
          const results = options.industryName
            ? _.filter(
                companiesInfo,
                (item) =>
                  item.icbName4 === options.industryName ||
                  item.icbName3 === options.industryName ||
                  item.icbName2 === options.industryName,
              )
            : companiesInfo;

          this.logger.log(
            `Successfully fetched partial industry data (${results.length} items)`,
          );
          return { data: results };
        }

        throw new Error('Invalid response format from GraphQL endpoint');
      } catch (graphqlError) {
        this.logger.warn(
          `Failed to fetch partial industry data: ${graphqlError.message}`,
        );
        throw graphqlError;
      }
    } catch (error) {
      this.logger.error(`Error in getPartialIndustryData: ${error.message}`);
      throw new Error(
        `Failed to fetch partial industry data: ${error.message}`,
      );
    }
  }

  /**
   * Gets all available ICB industry codes
   */
  async getIndustryCodes() {
    try {
      const query = `query Query {
        ListIcbCode {
          icbCode
          level
          icbName
          enIcbName
          __typename
        }
      }`;

      const response = await axios.post(
        this.GRAPHQL_URL,
        {
          operationName: 'Query',
          variables: {},
          query: query,
        },
        {
          timeout: 5000,
          headers: { 'Content-Type': 'application/json' },
        },
      );

      const listIcbCode = _.get(response, 'data.data.ListIcbCode', []);

      if (listIcbCode.length > 0) {
        return { data: listIcbCode };
      }

      throw new Error('Invalid response format from GraphQL endpoint');
    } catch (error) {
      this.logger.error(`Failed to fetch industry codes: ${error.message}`);
      throw new Error(`Failed to fetch industry codes: ${error.message}`);
    }
  }

  /**
   * Fetches all available stock symbols from VCI, grouped by industries.
   * This uses the VCI GraphQL endpoint to fetch industry data and groups
   * the result by industry using lodash.
   */
  async symbolsByIndustries() {
    try {
      this.logger.log(`Using VCI GraphQL endpoint: ${this.GRAPHQL_URL}`);

      // Use the VCI GraphQL endpoint with all required fields
      const payload = {
        variables: {},
        query: `{
          CompaniesListingInfo {
            ticker
            organName
            enOrganName
            icbName4
            enIcbName4
            comTypeCode
            __typename
          }
        }`,
      };

      const response = await axios.post(this.GRAPHQL_URL, payload, {
        timeout: 10000,
        headers: { 'Content-Type': 'application/json' },
      });

      // Safely get companies info with lodash
      const companiesInfo = _.get(
        response,
        'data.data.CompaniesListingInfo',
        [],
      );

      if (companiesInfo.length > 0) {
        this.logger.log(
          `Successfully fetched ${companiesInfo.length} companies from VCI`,
        );

        // Group companies by industry using lodash groupBy
        const groupedByIndustry = _.groupBy(companiesInfo, (company) =>
          _.get(company, 'icbName4', 'Unknown'),
        );

        // Transform grouped data into the desired output format
        const result = _.map(groupedByIndustry, (companies, industryName) => ({
          industry: industryName,
          symbols: _.map(companies, (company) => ({
            ticker: company.ticker,
            organName: company.organName,
            enOrganName: company.enOrganName,
            comTypeCode: company.comTypeCode,
          })),
        }));

        return result;
      }

      throw new Error('No company data received from VCI GraphQL endpoint');
    } catch (error) {
      this.logger.error(
        `Failed to fetch industry data from VCI: ${error.message}`,
      );
      if (error.response) {
        this.logger.error(
          `Status: ${error.response.status}, Data: ${JSON.stringify(
            _.get(error, 'response.data', {}),
          )}`,
        );
      }
      throw new Error(`Failed to fetch industry data: ${error.message}`);
    }
  }
}
