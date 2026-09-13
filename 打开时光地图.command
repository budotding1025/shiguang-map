#!/bin/bash
cd "$(dirname "$0")"
open -a Safari "index.html" 2>/dev/null || open "index.html"
