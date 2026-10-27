#!/usr/bin/env python3
"""Dump the full serialized ability graph of the two collab operators (one-off research tool).

Reads the official client's charpack / chararts / skills / projectiles / buff-template bundles through
tools/local-extract/fx.py's AssetEnv (the same reader the fx extractor uses) and writes
.cache/collab-abilities/<charId>.json + a readable .txt tree. Nothing here is shipped.

Usage:
  .venv-fx/Scripts/python.exe tools/local-extract/abilities.py --game "<AB root>" [--ids char_4217_makoto,char_4182_oblvns]
"""
import argparse
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import fx  # noqa: E402

DEFAULT_IDS = ('char_4217_makoto', 'char_4182_oblvns')
EFFECT_RE = re.compile(r'^(makoto|oblvns)', re.I)
PROJECTILE_RE = re.compile(r'^projectile_', re.I)
MAX_LIST = 32
MAX_DEPTH = 14


def ref_name(env, sfile, pptr):
    if not isinstance(pptr, dict):
        return None
    f, o = env.resolve(sfile, pptr)
    if o is None:
        return 'null' if not pptr.get('m_PathID') else f'unresolved#{pptr.get("m_PathID")}'
    if f == 'builtin':
        return f'builtin#{pptr.get("m_PathID")}'
    t = o.type.name
    try:
        d = env.tt(o) if t in ('GameObject', 'Transform', 'RectTransform', 'MonoBehaviour', 'TextAsset', 'Sprite') else {}
        if t in ('GameObject', 'Transform', 'RectTransform'):
            return f'{t}:{d.get("m_Name", "?")}'
        if t == 'MonoBehaviour':
            return f'mb:{env.script(o)[1]}'
        if t in ('TextAsset', 'Sprite', 'Texture2D'):
            return f'{t}:{d.get("m_Name", "?")}'
    except Exception:  # noqa: BLE001
        pass
    return f'{t}#{pptr.get("m_PathID")}'


def clean(env, sfile, v, depth=0):
    if depth > MAX_DEPTH:
        return '…'
    if isinstance(v, dict):
        if 'm_PathID' in v and set(v).issubset({'m_FileID', 'm_PathID'}):
            return {'$ref': ref_name(env, sfile, v), 'm_FileID': v.get('m_FileID', 0), 'm_PathID': v.get('m_PathID', 0)}
        return {k: clean(env, sfile, x, depth + 1) for k, x in v.items()}
    if isinstance(v, list):
        out = [clean(env, sfile, x, depth + 1) for x in v[:MAX_LIST]]
        if len(v) > MAX_LIST:
            out.append(f'… {len(v)} items')
        return out
    if isinstance(v, float):
        return round(v, 6)
    return v


def components(env, go, base=''):
    """[(node path, class, namespace, typetree)] for every MonoBehaviour under `go`."""
    out, seen, stack = [], set(), [(go, '')]
    while stack:
        g, path = stack.pop(0)
        if g.path_id in seen:
            continue
        seen.add(g.path_id)
        d = env.tt(g)
        name = d.get('m_Name', '?')
        node = f'{path}/{name}' if path else name
        for c in d.get('m_Component', []):
            f, o = env.resolve(g.assets_file, c.get('component'))
            if o is None or f == 'builtin' or o.type.name != 'MonoBehaviour':
                continue
            ns, cls = env.script(o)
            out.append({'path': node, 'class': cls, 'namespace': ns, 'fields': env.tt(o), 'sfile': o.assets_file})
        for k in fx.go_children(env, g):
            stack.append((k, node))
    return out


def find_blackboards(v, path='', out=None):
    """Every blackboard-looking list ({key, value|valueStr}) in a typetree, with its path."""
    if out is None:
        out = []
    if isinstance(v, dict):
        for k, x in v.items():
            kl = k.lower()
            if kl in ('blackboard', '_blackboard', 'blackboards') and isinstance(x, list):
                rows = []
                for r in x:
                    if isinstance(r, dict):
                        rows.append(clean_bb(r))
                if rows:
                    out.append({'path': f'{path}.{k}'.strip('.'), 'entries': rows})
            find_blackboards(x, f'{path}.{k}', out)
    elif isinstance(v, list):
        for i, x in enumerate(v):
            find_blackboards(x, f'{path}[{i}]', out)
    return out


def clean_bb(r):
    out = {}
    for k, x in r.items():
        if k in ('key', 'value', 'valueStr', 'buffKey', 'templateKey', 'name'):
            out[k] = x
        elif isinstance(x, (str, int, float, bool)) or x is None:
            out[k] = x
    return out


def parse_states(v):
    """Decode the buff templates' nested SerializedState JSON strings (action graphs) in place."""
    if isinstance(v, dict):
        for k, x in v.items():
            if k == 'SerializedState' and isinstance(x, str) and x.strip().startswith(('[', '{')):
                try:
                    v[k] = {'$parsed': json.loads(x), '$raw': x}
                except ValueError:
                    pass
            else:
                parse_states(x)
    elif isinstance(v, list):
        for x in v:
            parse_states(x)


def buff_templates(env):
    out = {}
    try:
        files = env.load_rel(fx.BUFF_TEMPLATES)
    except Exception as e:  # noqa: BLE001
        print(f'  warn: no buff templates: {e}', file=sys.stderr)
        return out
    for sf in files:
        for o in sf.objects.values():
            if o.type.name != 'MonoBehaviour':
                continue
            for t in env.tt(o).get('_templates') or []:
                if not isinstance(t, dict) or not t.get('templateKey'):
                    continue
                key = t['templateKey']
                if not EFFECT_RE.search(key):
                    continue
                tt = json.loads(json.dumps(t))
                parse_states(tt)
                out[key] = tt
    return out


def load_projectiles(env):
    try:
        return env.prefabs(fx.PROJECTILES)
    except Exception as e:  # noqa: BLE001
        print(f'  warn: no projectiles: {e}', file=sys.stderr)
        return {}


def load_skills(env):
    try:
        return env.prefabs(fx.SKILLS)
    except Exception as e:  # noqa: BLE001
        print(f'  warn: no skills: {e}', file=sys.stderr)
        return {}


def dump_char(env, ab_root, cid, projectiles, skills, templates):
    pack = env.prefabs(f'charpack/{cid}.ab').get(cid)
    if pack is None:
        raise SystemExit(f'{cid}: charpack prefab not found')
    unit_components = components(env, pack)
    chararts = env.prefabs(f'chararts/{cid}.ab')
    skin_components = []
    if 'defaultskin' in chararts:
        skin_components = components(env, chararts['defaultskin'])

    # skill ids from the client's skill prefab names (the operator's three skills; the unit prefab names no skill ids)
    skill_ids = [s for s in ('skchr_makoto_1', 'skchr_makoto_2', 'skchr_makoto_3') if cid == 'char_4217_makoto'] or \
                [s for s in ('skchr_oblvns_1', 'skchr_oblvns_2', 'skchr_oblvns_3') if cid == 'char_4182_oblvns']
    skill_components = {}
    for sid in skill_ids:
        go = skills.get(sid)
        if go is None:
            print(f'  warn: {cid}: skill prefab {sid} missing', file=sys.stderr)
            continue
        skill_components[sid] = components(env, go)

    all_mb = unit_components + [c for cs in skill_components.values() for c in cs] + skin_components
    proj_keys = set()
    for c in all_mb:
        for s in fx.all_strings(c['fields'], set()):
            if PROJECTILE_RE.match(s):
                proj_keys.add(s.lower())
    projectile_dump = {}
    for k in sorted(proj_keys):
        go = projectiles.get(k)
        if go is None:
            print(f'  warn: {cid}: projectile prefab {k} missing', file=sys.stderr)
            continue
        projectile_dump[k] = components(env, go)

    used_templates = {k: v for k, v in templates.items() if EFFECT_RE.search(k)}
    return {
        'charId': cid,
        'client': fx.client_version(ab_root),
        'charpack': f'charpack/{cid}.ab',
        'chararts': f'chararts/{cid}.ab',
        'skills': {k: [component_json(env, c) for c in v] for k, v in skill_components.items()},
        'projectiles': {k: [component_json(env, c) for c in v] for k, v in projectile_dump.items()},
        'buffTemplates': used_templates,
        'unitComponents': [component_json(env, c) for c in unit_components],
        'skinComponents': [component_json(env, c) for c in skin_components],
        'blackboards': {
            'unit': find_blackboards({c['class'] + '@' + c['path']: c['fields'] for c in unit_components}),
            'skills': {sid: find_blackboards({c['class'] + '@' + c['path']: c['fields'] for c in cs})
                       for sid, cs in skill_components.items()},
        },
    }


def component_json(env, c):
    return {'path': c['path'], 'class': c['class'], 'namespace': c['namespace'],
            'fields': clean(env, c['sfile'], c['fields'])}


def write_tree(out, doc):
    lines = [f"# {doc['charId']}  client {doc['client']}", '', '## unit prefab']
    for c in doc['unitComponents']:
        lines.append(f"  {c['path']} :: {c['class']}")
    for sid, cs in doc['skills'].items():
        lines += ['', f'## {sid}']
        for c in cs:
            lines.append(f"  {c['path']} :: {c['class']}")
    for k, cs in doc['projectiles'].items():
        lines += ['', f'## projectile {k}']
        for c in cs:
            lines.append(f"  {c['path']} :: {c['class']}")
    lines += ['', '## buff templates', '  ' + ', '.join(doc['buffTemplates'])]
    out.write_text('\n'.join(lines) + '\n', encoding='utf-8')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--game', required=True, help='AB root (…/StreamingAssets/AB/Windows)')
    ap.add_argument('--ids', default=','.join(DEFAULT_IDS))
    ap.add_argument('--out', default=str(HERE.parents[1] / '.cache/collab-abilities'))
    args = ap.parse_args()
    ab_root = Path(args.game)
    ids = [x.strip() for x in args.ids.split(',') if x.strip()]
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    env = fx.AssetEnv(ab_root, fx.scan_cabs(ab_root))
    projectiles, skills, templates = load_projectiles(env), load_skills(env), buff_templates(env)
    print(f'client {fx.client_version(ab_root)}; projectiles {len(projectiles)}; skills {len(skills)}; templates {len(templates)}')
    for cid in ids:
        doc = dump_char(env, ab_root, cid, projectiles, skills, templates)
        (out_dir / f'{cid}.json').write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding='utf-8')
        write_tree(out_dir / f'{cid}.txt', doc)
        print(f'{cid}: components {len(doc["unitComponents"])}; skills {len(doc["skills"])}; '
              f'projectiles {len(doc["projectiles"])}; skins {len(doc["skinComponents"])}; '
              f'templates {len(doc["buffTemplates"])} -> {out_dir / (cid + ".json")}')


if __name__ == '__main__':
    main()
