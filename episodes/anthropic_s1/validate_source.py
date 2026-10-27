"""Compare the locally downloaded, exact SEC filing with episode data.

The full filing is an ignored external input; only compact checks are retained.
Run: python validate_source.py --sec-html /path/to/anthropicpbc-sx1.htm
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path

import yaml
from bs4 import BeautifulSoup
from episode_paths import EPISODE_ROOT as ROOT


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--sec-html', type=Path, required=True)
    args = ap.parse_args()
    raw = args.sec_html.read_bytes()
    soup = BeautifulSoup(raw, 'html.parser')
    tables = soup.find_all('table')
    text = re.sub(r'\s+', ' ', soup.get_text(' ', strip=True))
    assert 'Anthropic, PBC' in text and 'October 26, 2026' in text
    f = yaml.safe_load((ROOT/'source/verified_financials.yaml').read_text())
    checks = []

    def row(table: int, label: str) -> list[int]:
        for tr in tables[table].find_all('tr'):
            cells = [c.get_text(' ', strip=True) for c in tr.find_all(['td', 'th'])]
            if not cells or cells[0] != label:
                continue
            values = []
            for cell in cells[1:]:
                if not cell:
                    continue
                v = re.sub(r'[$,%\s]', '', cell)
                if v in ('—', '–', '-'): values.append(0)
                elif re.fullmatch(r'\(?\d+\)?', v):
                    values.append(-int(v[1:-1]) if v.startswith('(') else int(v))
                else: raise ValueError((table, label, cell))
            return values
        raise ValueError(f'Missing table {table} row {label}')

    def compare(name: str, got: object, expected: object, table: int | None = None) -> None:
        checks.append({'name': name, 'table_index': table, 'pass': got == expected,
                       'observed': got, 'expected': expected})

    labels = {
        'revenue':'Revenue', 'compute_infrastructure':'Compute and infrastructure',
        'personnel':'Personnel (1)', 'bartz_settlement':'Bartz settlement',
        'sales_marketing_partnerships':'Sales, marketing, and partnerships',
        'other_operating_admin':'Other operating and administrative',
        'operating_expense':'Total operating expenses', 'operating_result':'Operating loss',
        'interest_income':'Interest income',
        'convertible_fair_value_result':'Change in fair value of convertible notes, derivative liabilities, and SAFEs',
        'other_nonoperating':'Other income (expense), net',
        'tax_expense':'Provision for income taxes', 'net_result':'Net loss (2)',
    }
    for key, label in labels.items(): compare('annual_halfyear.'+key, row(30,label), f['annual_halfyear'][key],30)
    compare('annual_halfyear.operating_cashflow',row(71,'Operating activities'),f['annual_halfyear']['operating_cashflow'],71)
    for key,label in {'revenue':'Revenue','compute_infrastructure':'Compute and infrastructure',
                      'operating_result':'Operating income (loss)','net_result':'Net loss'}.items():
        compare('quarterly.'+key,row(62,label),f['quarterly'][key],62)
    for key,label in {'adjusted_operating_result_non_gaap':'Adjusted Operating Income (Loss)',
                      'gaap_margin_percent_rounded':'Operating margin',
                      'adjusted_margin_percent_rounded':'Adjusted Operating Margin'}.items():
        compare('quarterly.'+key,row(64,label),f['quarterly'][key],64)
    cash=f['h1_2026_cash']
    cm={'net_result':'Net loss','operating_cashflow':'Net cash provided by (used in) operating activities',
        'investing_cashflow':'Net cash used in investing activities','investment_purchases':'Purchases of short-term investments',
        'investment_sales_maturities':'Sales and maturities of short-term investments','property_plant_equipment':'Purchases of property and equipment',
        'other_investing':'Other investing activities','financing_cashflow':'Net cash provided by financing activities',
        'preferred_share_financing':'Proceeds from issuance of redeemable convertible preferred stock, net of issuance costs'}
    for key,label in cm.items(): compare('cash.'+key,row(113,label)[-1],cash[key],113)
    for key,label in {'share_based_compensation':'Stock-based compensation expense','depreciation':'Depreciation and amortization',
        'convertible_fair_value':'Change in fair value of convertible notes, derivative liabilities, and SAFEs',
        'donation':'Donation matching program liability','other_financial_instrument_fair_value':'Recognition and change in fair value of other financial instruments','other':'Other'}.items():
        compare('cash.noncash.'+key,row(113,label)[-1],cash['noncash'][key],113)
    for key,label in {'accounts_receivable':'Accounts receivable, net','prepaids_other':'Prepaid expenses and other assets',
        'payables_accruals':'Accounts payable, accrued expenses, and other liabilities','leases':'Lease liabilities','deferred_revenue':'Deferred revenue'}.items():
        compare('cash.working_capital.'+key,row(113,label)[-1],cash['working_capital'][key],113)
    compare('cash.ending_cash',row(106,'Cash and cash equivalents')[-1],cash['ending_cash'],106)
    compare('cash.ending_short_term_investments',row(106,'Short-term investments')[-1],cash['ending_short_term_investments'],106)
    for period,index in [('h1_2026',-1),('fy2025',2)]:
        for key,label in {'operating':'Operating loss','sbc':'Stock-based compensation expense','donation':'Non-cash charitable contributions (1)','adjusted':'Adjusted Operating Income (Loss)'}.items():
            compare('non_gaap.'+period+'.'+key,row(60,label)[index],f['non_gaap'][period][key],60)
    a=f['annual_halfyear']
    arithmetic={
      'opex_components_all_periods':all(sum(a[k][i] for k in ('compute_infrastructure','personnel','bartz_settlement','sales_marketing_partnerships','other_operating_admin'))==a['operating_expense'][i] for i in range(5)),
      'operating_result_all_periods':all(a['revenue'][i]-a['operating_expense'][i]==a['operating_result'][i] for i in range(5)),
      'net_result_all_periods':all(a['operating_result'][i]+a['interest_income'][i]+a['convertible_fair_value_result'][i]+a['other_nonoperating'][i]-a['tax_expense'][i]==a['net_result'][i] for i in range(5)),
      'cash_bridge':cash['net_result']+cash['noncash_total']+cash['working_capital_total']==cash['operating_cashflow'],
      'noncash_components':sum(cash['noncash'].values())==cash['noncash_total'],
      'working_capital_components':sum(cash['working_capital'].values())==cash['working_capital_total'],
      'investing_components':sum(cash[k] for k in ('investment_purchases','investment_sales_maturities','property_plant_equipment','other_investing'))==cash['investing_cashflow'],
      'non_gaap_bridges':all(sum(v for k,v in d.items() if k!='adjusted')==d['adjusted'] for d in (f['non_gaap']['h1_2026'],f['non_gaap']['fy2025'])),
    }
    # These phrases support, but do not replace, human/contextual review of the surrounding paragraphs.
    context = {
      'NRR_cohort':"A Qualified Customer is a customer with at least $1 of revenue during the Base Period",
      'NRR_ratio':"by dividing the Qualified Customers’ Current Period revenue by their Base Period revenue",
      'NRR_exclusions':"excluding subscribers to our Claude Pro and Max plans",
      'current_board':"currently consists of six directors",
      'post_IPO_board':"Upon the completion of this offering, our board of directors will consist of seven authorized directors",
      'ClassT_four':"remove the four Class T directors",
      'A_F_three':"will have the authority to elect and remove the remaining three directors",
      'ClassN_condition':"own or control more than 9.99%",
      'Microsoft_period':"between November 2026 and May 2033",
      'Google_minimum':"at least approximately $114.5 billion between April 2026 and July 2033",
      'Google_extra_estimate':"billion to $150.0 billion, which are not included in the contractual commitments table above",
      'Amazon_period':"at least $110.0 billion between May 2026 and April 2036",
      'SpaceXAI_cancel':"may be cancelled by either party upon 90 days’ advance written notice",
      'Broadcom_lease':"approximately $161.2 billion excluding interest",
    }
    context_checks={k:v in text for k,v in context.items()}
    result={'schema_version':1,'verified_at':datetime.now(timezone.utc).isoformat(),
      'source_url':f['provenance']['source_url'],'source_size_bytes':len(raw),'source_sha256':hashlib.sha256(raw).hexdigest(),
      'source_opened_directly':True,'numeric_checks':checks,'arithmetic_checks':arithmetic,
      'context_phrase_checks':context_checks,'scope':'Exact financial tables plus reviewed surrounding business/commitment/governance paragraphs. No news substituted.'}
    result['pass']=all(c['pass'] for c in checks) and all(arithmetic.values()) and all(context_checks.values())
    (ROOT/'source_validation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
    print(json.dumps({'numeric_checks':len(checks),'arithmetic':arithmetic,'context':context_checks,'pass':result['pass']},ensure_ascii=False))
    assert result['pass'],[c for c in checks if not c['pass']]


if __name__=='__main__':main()
