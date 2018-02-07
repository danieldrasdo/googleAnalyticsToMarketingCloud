# googleAnalyticsToMarketingCloud
Node app to pull data from Google Analytics and post into a Salesforce Marketing Cloud Data Extension.

This assumes your utm variables are as follows...

| VARIABLE | VALUE |
| :--- | ---: |
| utm_medium | email |
| utm_term | %%=Format(Now(true),''yyyyMMdd'')=%% |
| utm_source | typeOfEmail |

You must also create a data extension within Marketing Cloud with an external key of `google-analytics` that has the following info...

| Name | Data Type | Length | Primary key |
| :--- | :--- | :---: | ---: |
| campaign | Text | 100 | Yes |
| keyword | Text | 8 | Yes |
| source | Text | 100 | No |
| sessions | Number |  | No |
| bounces | Number |  | No |
| bounceRate | Decimal | 20,10 | No |
| transactions | Number |  | No |
| transactionsPerSession | Decimal | 20,10 | No |
| transactionRevenue | Decimal | 12,2 | No |
| transactionRevenuePerSession | Decimal | 20,10 | No |

No nullables, empty default values. This assumes what makes an email unique is the campaign name and keyword combo.
