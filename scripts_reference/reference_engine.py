"""Reference metric engine for the RISA Growth Center (Challenge B, sponsorship).
Every number in reference_metrics.json comes from this file. The app must reproduce them."""
import pandas as pd, numpy as np, json
D='../data/source_csv/'; S='../data/simulated/'
rd=lambda f: pd.read_csv(D+f)
def ts(df,cols):
    for c in cols: df[c]=pd.to_datetime(df[c],utc=True).dt.tz_convert('Asia/Kolkata')
    return df
brands=ts(rd('brands.csv'),['created_at']); contacts=ts(rd('contacts.csv'),['created_at'])
camps=ts(rd('sponsor_campaigns.csv'),['planned_start_at','planned_end_at','created_at'])
inter=ts(rd('sponsor_interactions.csv'),['occurred_at']).drop_duplicates('interaction_id')
qual=ts(rd('brand_qualification_history.csv'),['effective_at']).drop_duplicates('history_id')
opps=ts(rd('opportunities.csv'),['created_at'])
oh=ts(rd('opportunity_history.csv'),['effective_at']).drop_duplicates('history_id')
targets=ts(rd('targets.csv'),['effective_at']); event=ts(rd('event.csv'),['event_starts_at','event_ends_at'])
FEST_START=event.event_starts_at.iloc[0]
OPEN=['prospecting','contacted','proposal_sent','negotiating']; PROP=['proposal_sent','negotiating','partner_confirmed']
WARM={'SC02','SC04','SC05'}
STAGE_W={'prospecting':0.10,'contacted':0.20,'proposal_sent':0.40,'negotiating':0.60}  # assumption, editable in app
COLLECT_RATE=0.90  # assumption, editable in app
def eod(d): return pd.Timestamp(d+' 23:59:59.999999',tz='Asia/Kolkata')
def latest(df,key,t,col='effective_at'):
    v=df[df[col]<=t].sort_values([col,'history_id']); return v.groupby(key).tail(1)

# ---------- simulated data (clearly labelled source='simulated', fixed seed) ----------
def build_simulated():
    rng=np.random.default_rng(20250412)
    final=latest(oh,'opportunity_id',eod('2025-04-20')).merge(opps[['opportunity_id','support_type','sponsor_campaign_id']],on='opportunity_id')
    conf=final[(final.stage=='partner_confirmed')&(final.support_type=='cash')]
    first_conf=oh[oh.stage=='partner_confirmed'].groupby('opportunity_id').effective_at.min()
    rows=[]; n=0
    bal_due_default=pd.Timestamp('2025-03-22 18:00',tz='Asia/Kolkata')
    for _,r in conf.sort_values('opportunity_id').iterrows():
        c=first_conf[r.opportunity_id]; amt=int(r.confirmed_value_inr); adv=amt//2; bal=amt-adv
        adv_due=c+pd.Timedelta(days=7); bal_due=max(bal_due_default,c+pd.Timedelta(days=7))
        u=rng.random()
        adv_paid=c+pd.Timedelta(days=int(rng.integers(1,8))) if u<0.75 else (c+pd.Timedelta(days=int(rng.integers(10,21))) if u<0.95 else None)
        u=rng.random()
        if u<0.60: bal_paid=bal_due-pd.Timedelta(days=int(rng.integers(0,6)))
        elif u<0.85: bal_paid=min(bal_due+pd.Timedelta(days=int(rng.integers(1,16))),pd.Timestamp('2025-04-11 17:00',tz='Asia/Kolkata'))
        elif u<0.95: bal_paid=pd.Timestamp('2025-04-14 15:00',tz='Asia/Kolkata')+pd.Timedelta(days=int(rng.integers(0,6)))
        else: bal_paid=None
        if adv_paid is None: bal_paid=None
        if bal_paid is not None and adv_paid is not None and bal_paid<adv_paid: bal_paid=adv_paid+pd.Timedelta(hours=2)
        for kind,a,due,paid in [('advance',adv,adv_due,adv_paid),('balance',bal,bal_due,bal_paid)]:
            n+=1
            rows.append(dict(installment_id=f'PAY{n:03d}',opportunity_id=r.opportunity_id,opportunity_name=r.opportunity_name,brand_id=r.brand_id,brand_name=r.brand_name,
                installment=kind,amount_due_inr=a,due_at=due.strftime('%Y-%m-%dT%H:%M:%S+05:30'),
                paid_at=None if paid is None else paid.replace(hour=15,minute=0).strftime('%Y-%m-%dT%H:%M:%S+05:30'),
                amount_paid_inr=0 if paid is None else a,source='simulated'))
    pay=pd.DataFrame(rows); pay.to_csv(S+'payment_installments.csv',index=False)
    bud=pd.DataFrame([
        ('SC01','Brand Discovery Email',30000,'Email tool + prospect list research'),
        ('SC02','Warm Partner Introductions',10000,'Alumni meetups and thank-you gifts'),
        ('SC03','Brand Leader LinkedIn',25000,'LinkedIn Sales Navigator seats'),
        ('SC04','Partner Interest Form',8000,'Partner landing page and form'),
        ('SC05','Creator Network Referrals',40000,'Creator referral fees'),
        ('SC06','Past Conversation Revival',5000,'Email tool share')],columns=['sponsor_campaign_id','campaign_name','planned_budget_inr','budget_note'])
    bud['source']='simulated'; bud.to_csv(S+'campaign_budgets.csv',index=False)
    sp=[]; k=0
    months=[('2025-01-31',0.20),('2025-02-28',0.35),('2025-03-31',0.35),('2025-04-10',0.10)]
    spend_factor={'SC01':1.0,'SC02':0.9,'SC03':1.0,'SC04':0.75,'SC05':1.1,'SC06':0.8}
    for _,b in bud.iterrows():
        for d,f in months:
            k+=1; sp.append(dict(spend_id=f'SP{k:03d}',sponsor_campaign_id=b.sponsor_campaign_id,campaign_name=b.campaign_name,spent_at=d+'T18:00:00+05:30',amount_inr=int(round(b.planned_budget_inr*f*spend_factor[b.sponsor_campaign_id]/100)*100),note='Monthly posted spend',source='simulated'))
    pd.DataFrame(sp).to_csv(S+'campaign_spend.csv',index=False)
    tasks=pd.DataFrame([
        ('TSK001','Send renewal proposal to Beardo','SC02','O001','A001','T01','Riya Kapoor','2025-04-25','open','Renewal for next edition'),
        ('TSK002','Chase overdue balance invoices before festival','','','','T02','Kabir Shah','2025-04-08','open','Collections'),
        ('TSK003','Review stale negotiating deals from LinkedIn','SC03','','','T01','Riya Kapoor','2025-03-28','open','Stale pipeline'),
        ('TSK004','Ask confirmed partners for two brand introductions each','SC02','','','T05','Nisha Rao','2025-03-20','done','Referral engine'),
        ('TSK005','Pause Brand Discovery Email sends pending review','SC01','','','T02','Kabir Shah','2025-03-25','open','Channel review'),
        ('TSK006','Prepare sponsor recap report template','','','','T03','Meera Iyer','2025-04-18','open','Post-event reporting'),
    ],columns=['task_id','title','sponsor_campaign_id','opportunity_id','brand_id','owner_id','owner_name','due_date','status','notes'])
    tasks['created_at']='2025-03-15T10:00:00+05:30'; tasks['source']='simulated'; tasks.to_csv(S+'tasks.csv',index=False)
    return pay,bud,pd.DataFrame(sp)
pay,bud,spend=build_simulated()
pay=ts(pay,['due_at','paid_at']); spend=ts(spend,['spent_at'])

# ---------- metrics ----------
def snapshot(d,campaign=None):
    t=eod(d)
    b=brands[brands.created_at<=t]; I=inter[inter.occurred_at<=t]; O=opps[opps.created_at<=t]
    if campaign: I=I[I.sponsor_campaign_id==campaign]; O=O[O.sponsor_campaign_id==campaign]
    L=latest(oh[oh.opportunity_id.isin(O.opportunity_id)],'opportunity_id',t).merge(O[['opportunity_id','support_type','sponsor_campaign_id']],on='opportunity_id')
    H=oh[(oh.effective_at<=t)&(oh.opportunity_id.isin(O.opportunity_id))]
    conf=L[L.stage=='partner_confirmed']; op=L[L.stage.isin(OPEN)]
    stale=op[(t-op.effective_at).dt.total_seconds()>7*86400]
    Q=latest(qual,'brand_id',t)
    if campaign: Q=Q[Q.brand_id.isin(I.brand_id)]
    P=pay[pay.opportunity_id.isin(O.opportunity_id)]
    paid=P[P.paid_at.notna()&(P.paid_at<=t)]
    paid_before_fest=paid[paid.paid_at<FEST_START]
    due_pending=P[(P.due_at<=t)&~(P.paid_at.notna()&(P.paid_at<=t))]
    cash_conf=int(conf[conf.support_type=='cash'].confirmed_value_inr.sum())
    collected=int(paid.amount_paid_inr.sum())
    wpipe=float((op.proposed_value_inr*op.stage.map(STAGE_W)).sum()); wpipe_cash=float((op[op.support_type=='cash'].proposed_value_inr*op[op.support_type=='cash'].stage.map(STAGE_W)).sum())
    out=dict(as_of=d,
      prospects_brands=int(b.brand_id.nunique()) if not campaign else int(I.brand_id.nunique()),
      contacted_brands=int(I[I.event_type.isin(['outreach_sent','introduction_received','web_inbound'])].brand_id.nunique()),
      responded_brands=int(I[I.event_type=='replied'].brand_id.nunique()),
      positive_reply_brands=int(I[(I.event_type=='replied')&(I.outcome=='positive')].brand_id.nunique()),
      conversation_brands=int(I[I.event_type=='meeting_held'].brand_id.nunique()),
      qualified_brands=int((Q.qualification_status=='qualified').sum()),
      opportunities_created=int(len(O)),
      proposals=int(H[H.stage.isin(PROP)].opportunity_id.nunique()),
      confirmed_partnerships=int(len(conf)),
      confirmed_brands=int(conf.brand_id.nunique()),
      confirmed_value_total_inr=int(conf.confirmed_value_inr.sum()),
      confirmed_value_cash_inr=cash_conf,
      confirmed_value_in_kind_inr=int(conf[conf.support_type=='in_kind'].confirmed_value_inr.sum()),
      lost_or_withdrawn=int(L.stage.isin(['lost','withdrawn']).sum()),
      open_opportunities=int(len(op)), open_pipeline_proposed_inr=int(op.proposed_value_inr.sum()),
      stale_open_opportunities_7d=int(len(stale)),
      weighted_open_pipeline_inr=round(wpipe),
      cash_collected_inr_simulated=collected,
      cash_collected_before_festival_inr_simulated=int(paid_before_fest.amount_paid_inr.sum()),
      outstanding_confirmed_cash_inr_simulated=cash_conf-collected,
      overdue_installments_simulated=int(len(due_pending)), overdue_amount_inr_simulated=int(due_pending.amount_due_inr.sum()),
      projected_cash_before_festival_inr=(int(paid_before_fest.amount_paid_inr.sum()) if t>=FEST_START else round(collected+(cash_conf-collected)*COLLECT_RATE+wpipe_cash*COLLECT_RATE)),
    )
    if not campaign:
        T=targets[targets.effective_at<=t]
        if len(T):
            tv=T.sort_values('effective_at').iloc[-1]; out.update(target_version=tv.target_version,qualified_brands_goal=int(tv.qualified_brands_goal),confirmed_partnerships_goal=int(tv.confirmed_partnerships_goal))
        else: out.update(target_version=None,qualified_brands_goal=None,confirmed_partnerships_goal=None)
    return out
dates=['2025-01-31','2025-02-24','2025-02-25','2025-03-10','2025-03-14','2025-03-15','2025-03-20','2025-03-31','2025-04-11','2025-04-20']
ref={'definitions_version':'1.0','assumptions':{'stage_weights':STAGE_W,'collection_rate':COLLECT_RATE,'stale_days':7,'festival_start':str(FEST_START)},
     'snapshots':{d:snapshot(d) for d in dates},
     'by_campaign_final':{c:snapshot('2025-04-20',c) for c in camps.sponsor_campaign_id},
     'by_campaign_2025-03-15':{c:snapshot('2025-03-15',c) for c in camps.sponsor_campaign_id}}
# owners & industry at final
t=eod('2025-04-20'); L=latest(oh,'opportunity_id',t).merge(brands[['brand_id','industry']],on='brand_id')
ref['by_owner_final']={o:dict(opportunities=int(len(g)),confirmed=int((g.stage=='partner_confirmed').sum()),confirmed_value_inr=int(g[g.stage=='partner_confirmed'].confirmed_value_inr.sum())) for o,g in L.groupby('owner_name')}
ref['by_industry_final']={i:dict(opportunities=int(len(g)),confirmed=int((g.stage=='partner_confirmed').sum()),confirmed_value_inr=int(g[g.stage=='partner_confirmed'].confirmed_value_inr.sum())) for i,g in L.groupby('industry')}
ref['edge_cases']=dict(
  cobalt_learning_O_id=opps[opps.brand_name=='Cobalt Learning'].opportunity_id.iloc[0],
  cobalt_confirmed_on_2025_03_10=bool(latest(oh,'opportunity_id',eod('2025-03-10')).query("brand_name=='Cobalt Learning'").stage.iloc[0]=='partner_confirmed'),
  cobalt_confirmed_on_2025_04_20=bool(latest(oh,'opportunity_id',eod('2025-04-20')).query("brand_name=='Cobalt Learning'").stage.iloc[0]=='partner_confirmed'),
  beardo_opportunities=int((opps.brand_name=='Beardo').sum()),
  raw_vs_unique=dict(interactions=[953,int(len(inter))],qualification=[434,int(len(qual))],opportunity_history=[230,int(len(oh))]))
ref['budgets_simulated']={r.sponsor_campaign_id:dict(planned=int(r.planned_budget_inr),spent_to_2025_04_20=int(spend[(spend.sponsor_campaign_id==r.sponsor_campaign_id)].amount_inr.sum())) for r in bud.itertuples()}

def decide(m):
    reached=m['contacted_brands']; mr=m['conversation_brands']/reached if reached else 0
    closed=m['confirmed_partnerships']+m['lost_or_withdrawn']; wr=m['confirmed_partnerships']/closed if closed else 0
    if m['opportunities_created']<5 and closed<3: return 'WATCH'
    if closed>=3 and wr>=0.5 and mr>=0.4: return 'SCALE'
    if m['confirmed_partnerships']==0 and m['opportunities_created']>=8 and mr<0.25: return 'STOP'
    return 'CHANGE'
ref['decisions_final']={c:decide(m) for c,m in ref['by_campaign_final'].items()}
ref['decisions_2025-03-15']={c:decide(m) for c,m in ref['by_campaign_2025-03-15'].items()}
json.dump(ref,open('../reference_metrics.json','w'),indent=2,default=str)
f=ref['snapshots']['2025-04-20']; print(json.dumps(f,indent=1))
for d in ['2025-03-10','2025-03-15','2025-03-31','2025-04-11']: s=ref['snapshots'][d]; print(d,s['confirmed_partnerships'],s['confirmed_value_cash_inr'],s['qualified_brands'],s['qualified_brands_goal'],s['confirmed_partnerships_goal'],s['open_opportunities'],s['stale_open_opportunities_7d'],s['cash_collected_inr_simulated'],s['projected_cash_before_festival_inr'])
print(ref['edge_cases']); print({c:(v['confirmed_partnerships'],v['confirmed_value_cash_inr'],v['conversation_brands'],v['stale_open_opportunities_7d']) for c,v in ref['by_campaign_final'].items()})
