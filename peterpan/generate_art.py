#!/usr/bin/env python3
"""Original Peter Pan storybook images, rendered locally with Agnes, no key copied."""
from pathlib import Path
import subprocess,sys,time
from PIL import Image,ImageChops,ImageOps,ImageFilter
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"peterpan/assets"
STYLE="Original Edwardian English fairy tale art, exquisite hand painted watercolor gouache, moonlit midnight indigo and warm gold highlights, intricate lush painterly forest, sophisticated illustrated vintage picture book, unified lighting, NO Disney or copyrighted movie character designs, no letters, no title, no watermark. "
SCENES=[
"quiet Edwardian London children's nursery at night, three beds, antique drawer chest, open moonlit window, empty floor",
"same nursery at night, open chest drawer, bar of soap, shadow along polished floor, cozy lamps",
"same nursery at night with vintage sewing kit, window and moonlight, wooden stool and bed",
"old London rooftops and nursery windows below a spectacular sky of stars and clouds",
"great starry night sky above London with clouds and Neverland island on horizon",
"enchanted Neverland island aerial panorama, pirate ship, forests, turquoise mermaid lagoon, beaches",
"enchanted moonlit forest glade, arrow on forest floor and acorn pendant among moss",
"flower-filled woodland clearing with tiny newly built house made of twigs and leaves",
"cosy underground tree root family home, fireplace, round wooden table, beds, antique book",
"old wooden pirate ship deck over midnight ocean, captain's wheel, brass pocket clock",
"mermaid lagoon with turquoise surf, tidal rock, distant pirate row boat under moon",
"flooding mermaid lagoon with tidal rock, abandoned nest raft floating in water",
"cosy tree-root home dining room, long table and empty ceramic plates, magic fireplace",
"tree root home with wall glowing faint image of faraway London nursery window",
"underground tree root house exit to forest, old travel bag on wooden table",
"tree root hiding place with dark pirate footprints outside and mysterious medicine cup",
"dim underground bedchamber with medicine cup, golden fairy lights fading in darkness",
"towering wooden pirate ship under eerie midnight sky, dark water and wood rigging",
"inside pirate ship hold, lanterns, rope and high deck hatch, deep shadows",
"dramatic broad empty pirate ship deck, billowing sails and moonlit ocean, dramatic sky",
"pirate ship leaving Neverland into sunrise, sailing toward silhouette of London",
"familiar Edwardian nursery with three tidy beds, sunrise through open window",
"warm London nursery with extra small beds, open window on starry night",
"years later refined Edwardian London nursery with child's bed and moonlit window, nostalgic",
]
SPRITES={
"peter":"single flying mischievous young boy brown hair and costume sewn from forest leaves, full body",
"wendy":"single gentle Edwardian girl brown braided hair pale blue nightdress, full body",
"john":"single Edwardian boy pajamas, glasses, full body",
"michael":"single small Edwardian boy pajamas, full body",
"tinker":"single original petite golden fairy dragonfly wings forest petal dress, full body",
"mother":"single adult warm Edwardian mother dark blue gown, full body",
"nana":"single sweet shaggy Newfoundland dog with bonnet, full body",
"lost_boys":"three small children wearing ragged handmade forest clothes, group full body",
"hook":"single intimidating old pirate captain burgundy coat feather hat a metal hook on one arm, full body",
"tiger_lily":"single brave fictional princess of Neverland in ornate embroidered cloak, culturally respectful original fantasy design, full body",
"crocodile":"single green clockwork fantasy crocodile, full body",
"never_bird":"single beautiful light-blue coastal seabird, full body",
"jane":"single young Edwardian girl soft cream nightgown, full body",
"shadow":"single black silhouette of a child and his shadow",
"sewing":"single antique needle and spool of thread",
"acorn":"single beautiful little acorn button pendant",
"pixiedust":"single small glass bottle containing golden fairy dust",
"star":"single bright five-point guiding golden star",
"map":"single curled aged parchment map of an imaginary island without writing",
"cottage":"single tiny whimsical cottage made of twigs leaves flowers",
"storybook":"single old blue leather storybook with golden clasp, three quarter view",
"clock":"single brass pocket clock with chain",
"rope":"single coiled sailor rope",
"nest":"single cozy woven bird nest raft",
"plate":"single painted vintage dinner plate",
"window":"single old wooden open London nursery window",
"bag":"single small antique travelling leather satchel",
"poison":"single ominous green glass potion vial",
"helm":"single pirate ship wooden ship wheel",
"bed":"single Edwardian child bed",
"arrow":"single wooden arrow with white feather",
}
def create(name,prompt,size,dest,cutout=False):
 if dest.exists() and dest.stat().st_size>4000:return print("SKIP",name,flush=True)
 for attempt in range(2):
  p=subprocess.run([sys.executable,str(ROOT/"scripts/agnes_draw.py"),"--prompt",STYLE+prompt,"--name","pp-"+name,"--size",size],cwd=ROOT,text=True,capture_output=True,timeout=290)
  if p.returncode==0:
   img=Image.open(Path(p.stdout.strip().splitlines()[-1])).convert("RGB")
   if cutout:
    # White matte to transparency; images retain raw originals in ignored art-drafts.
    delta=ImageChops.difference(img,Image.new("RGB",img.size,"white"))
    alpha=ImageOps.grayscale(delta).point(lambda v:min(255,round(v*3))).filter(ImageFilter.GaussianBlur(.65))
    img.putalpha(alpha)
   dest.parent.mkdir(parents=True,exist_ok=True)
   img.save(dest,"WEBP",quality=80,method=4)
   return print("DONE",name,flush=True)
  print("RETRY",name,attempt,flush=True);time.sleep(6)
 print("FAIL",name,flush=True)
if __name__=="__main__":
 import argparse
 a=argparse.ArgumentParser();a.add_argument("--group",default="all",choices=["all","scenes","sprites","cover"]);group=a.parse_args().group
 if group in ("all","cover"):create("cover","beautiful vertical magical starry storybook cover art, flying leaf-dressed child in silhouette over dreamy Neverland island and antique pirate ship, beautiful ornamented composition, blank title area","768x1024",OUT/"cover.webp")
 if group in ("all","scenes"):
  for i,p in enumerate(SCENES,1):create("scene-%02d"%i,p,"1024x768",OUT/"scenes"/("page-%02d.webp"%i))
 if group in ("all","sprites"):
  for name,prompt in SPRITES.items():create(name,prompt+", isolated on PURE WHITE background, no scenery, original watercolor storybook sticker","768x1024" if name in ["peter","wendy","john","michael","tinker","mother","nana","lost_boys","hook","tiger_lily","crocodile","never_bird","jane"] else "1024x1024",OUT/"sprites"/(name+".webp"),True)
