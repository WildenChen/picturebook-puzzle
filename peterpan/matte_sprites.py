#!/usr/bin/env python3
"""Prepare Agnes sprites for illustration compositing, preserving source drafts."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFilter
import argparse,shutil
ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/"peterpan/assets/sprites"
BACKUP=ROOT/"art-drafts/peterpan-sprites-before-matting"
def matte(name):
 files=sorted((ROOT/"art-drafts").glob("pp-"+name+"-*.png"))
 if not files: return print("MISSING SOURCE",name,flush=True)
 src=files[-1]
 img=Image.open(src).convert("RGBA")
 corners=[(0,0),(img.width-1,0),(0,img.height-1),(img.width-1,img.height-1)]
 if not all(min(img.getpixel(x)[:3])>210 for x in corners):
  return print("NONWHITE_BG",name,flush=True)
 for point in corners:
  ImageDraw.floodfill(img,point,(255,255,255,0),thresh=63)
 alpha=img.getchannel("A")
 bbox=alpha.point(lambda a:255 if a>80 else 0).getbbox()
 if not bbox:
  return print("NO_SUBJECT",name,flush=True)
 if bbox[2]-bbox[0] > img.width*.96 and bbox[3]-bbox[1]>img.height*.96:
  print("WARNING_LARGE_BBOX",name,bbox,flush=True)
 img=img.crop(bbox)
 # Subtle smoothing on antialiased contour.
 img.putalpha(img.getchannel("A").filter(ImageFilter.GaussianBlur(.6)))
 character=name in ("peter","wendy","john","michael","tinker","mother","nana","lost_boys","hook","tiger_lily","crocodile","never_bird","jane")
 W,H=(900,1200) if character else (900,900)
 scale=min((W*.89)/img.width,(H*.89)/img.height)
 im=img.resize((max(1,round(img.width*scale)),max(1,round(img.height*scale))),Image.Resampling.LANCZOS)
 result=Image.new("RGBA",(W,H),(0,0,0,0))
 result.alpha_composite(im,((W-im.width)//2,int(H*.94)-im.height))
 dest=DEST/(name+".webp")
 BACKUP.mkdir(parents=True,exist_ok=True)
 saved=BACKUP/dest.name
 if not saved.exists():shutil.copy2(dest,saved)
 result.save(dest,"WEBP",quality=90,method=5)
 print("MATTED",name,bbox,"size",im.size,"transparentCorners",sum(result.getpixel(p)[3]==0 for p in [(0,0),(W-1,0),(0,H-1),(W-1,H-1)]),flush=True)
if __name__=="__main__":
 p=argparse.ArgumentParser();p.add_argument("--name");args=p.parse_args()
 if args.name:matte(args.name)
 else:
  for f in sorted(DEST.glob("*.webp")):matte(f.stem)
