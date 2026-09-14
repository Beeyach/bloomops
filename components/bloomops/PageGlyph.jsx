'use client';
import {Icon} from '../Icons';
import {PAGE_ICONS} from '@/lib/bloomops/page-icons.mjs';
export default function PageGlyph({name='file',size=18}){return <span className="bo-page-glyph" data-page-icon={PAGE_ICONS.includes(name)?name:'file'} style={{width:size,height:size}}><Icon name={PAGE_ICONS.includes(name)?name:'file'} className="w-full h-full"/></span>;}
