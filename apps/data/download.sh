#!/bin/zsh

readonly root="$(cd "$(dirname "$0")"; pwd)"

mkdir -p "${root}/data"

curl http://tdc-www.harvard.edu/catalogs/ybsc5.gz | gunzip - >"${root}/data/ybsc5"
curl --location https://github.com/NVIDIAGameWorks/SpatiotemporalBlueNoiseSDK/raw/refs/heads/main/STBN.zip | bsdtar -x --directory "${root}/data"
curl https://cave.cs.columbia.edu/old/databases/rain_streak_db/databases.zip | bsdtar -x --directory "${root}/data"
