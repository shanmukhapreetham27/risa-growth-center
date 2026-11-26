"""Slide 1 model: CampusFest Bengaluru, sponsorship cash collected before the festival.
Sourced baseline = CampusFest 2025 sponsor dataset. Everything else is a labelled assumption."""
import json
E={ # prospects, conv%, proposal%, signed%, avg deal INR, collect% (with cash-first terms)
 'A Renewal and upsell desk':      {'base':(24,.90,.85,.65, 95000,.92),'stretch':(24,.95,.90,.75,120000,.96)},
 'B Warm intro engine':            {'base':(50,.80,.65,.50, 90000,.92),'stretch':(70,.82,.70,.65, 95000,.96)},
 'C Near miss reactivation':       {'base':(26,.50,.70,.25, 55000,.92),'stretch':(40,.60,.75,.40, 60000,.96)},
 'D Anchor partner ABM':           {'base':(12,.40,.60,.30,350000,.70),'stretch':(15,.50,.70,.40,400000,.85)},
}
NO_POLICY_COLLECT={'A Renewal and upsell desk':.80,'B Warm intro engine':.80,'C Near miss reactivation':.80,'D Anchor partner ABM':.60}
out={}
for case in ['base','stretch']:
    rows=[];tot=dict(prospects=0,conversations=0,proposals=0,signed=0,signed_value=0,cash=0,cash_no_policy=0)
    for k,v in E.items():
        p,c,pr,s,deal,col=v[case]
        conv=p*c; prop=conv*pr; sig=prop*s; val=sig*deal; cash=val*col; cnp=val*NO_POLICY_COLLECT[k]
        rows.append(dict(engine=k,prospects=p,conversations=round(conv,1),proposals=round(prop,1),signed=round(sig,1),avg_deal=deal,signed_value=round(val),collect_rate=col,cash=round(cash)))
        for a,b in [('prospects',p),('conversations',conv),('proposals',prop),('signed',sig),('signed_value',val),('cash',cash),('cash_no_policy',cnp)]: tot[a]+=b
    out[case]=dict(rows=rows,total={k:round(v,1) for k,v in tot.items()})
    print(f'\n== {case.upper()} ==')
    for r in rows: print(f"{r['engine']:<28} {r['prospects']:>4} → {r['conversations']:>5} → {r['proposals']:>5} → {r['signed']:>5} deals × ₹{r['avg_deal']:,} = ₹{r['signed_value']/1e5:.2f}L signed → {r['collect_rate']:.0%} → ₹{r['cash']/1e5:.2f}L")
    t=out[case]['total']; print(f"TOTAL {t['prospects']} prospects → {t['conversations']} conv → {t['proposals']} proposals → {t['signed']} deals → ₹{t['signed_value']/1e5:.2f}L signed → ₹{t['cash']/1e5:.2f}L cash (no policy ₹{t['cash_no_policy']/1e5:.2f}L, cash-first lift ₹{(t['cash']-t['cash_no_policy'])/1e5:.2f}L)")
# Capacity: last year 60 discovery conversations handled by 3 opportunity owners (~20 each). Assume 20 base, 25 stretch with copilot.
for case,per in [('base',20),('stretch',25)]:
    c=out[case]['total']['conversations']; print(case,'conversations',c,'owners needed',round(c/per,1))
# Inventory (capacity cap on what can be sold)
inv=[('Presenting partner',1,600000),('Category exclusive partner',4,300000),('Zone partner',8,150000),('Experience partner',25,90000),('Sampling partner',25,40000)]
iv=sum(n*p for _,n,p in inv); slots=sum(n for _,n,_ in inv); print('inventory value',iv,'slots',slots)
for case in ['base','stretch']: print(case,'sell-through value',round(out[case]['total']['signed_value']/iv*100,1),'% slots',round(out[case]['total']['signed']/slots*100,1),'%')
# RICE style score: expected base cash x confidence / effort person-weeks
conf={'A':.8,'B':.6,'C':.5,'D':.3,'E':.7}; eff={'A':4,'B':20,'C':3,'D':8,'E':3}
bc={r['engine'][0]:r['cash'] for r in out['base']['rows']}; bc['E']=out['base']['total']['cash']-out['base']['total']['cash_no_policy']
sc={k:round(bc[k]/1e5*conf[k]/eff[k],2) for k in bc}; print('base cash by idea (L)',{k:round(v/1e5,2) for k,v in bc.items()}); print('RICE score',sorted(sc.items(),key=lambda x:-x[1]))
st={r['engine'][0]:r['cash'] for r in out['stretch']['rows']}; st['E']=out['stretch']['total']['cash']-sum(r['signed_value']*NO_POLICY_COLLECT[r['engine']] for r in out['stretch']['rows'])
print('stretch cash by idea (L)',{k:round(v/1e5,2) for k,v in st.items()})
out['inventory']=inv; out['rice']=sc; json.dump(out,open('../docs/growth_model.json','w'),indent=1)
