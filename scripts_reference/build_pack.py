import pandas as pd, numpy as np, json
SRC='../data/Sponsor Dataset.xlsx'
x=pd.read_excel(SRC,sheet_name=None)
names={'Event':'event','Targets':'targets','Brands':'brands','Sponsor contacts':'contacts','Sponsor campaigns':'sponsor_campaigns','Sponsor interactions':'sponsor_interactions','Brand qualification':'brand_qualification_history','Partner opportunities':'opportunities','Opportunity history':'opportunity_history','Sponsor activations':'sponsor_activations','Field guide':'field_guide','Read me':'read_me'}
def iso(df):
    df=df.copy()
    for c in df.columns:
        if pd.api.types.is_datetime64_any_dtype(df[c]):
            df[c]=df[c].dt.strftime('%Y-%m-%dT%H:%M:%S+05:30')
    return df
for sh,n in names.items():
    iso(x[sh].dropna(how='all')).to_csv(f'../data/source_csv/{n}.csv',index=False)
print('exported',len(names),'CSVs')
