/**
 * Copyright 2020, Sourcepole AG.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import axios from 'axios';
import url from 'url';
import ConfigUtils from 'qwc2/utils/ConfigUtils';
import {UrlParams} from 'qwc2/utils/PermaLinkUtils';

class Autologin extends React.Component {
    static propTypes = {
        autologinUrl: PropTypes.string,
        startupParams: PropTypes.object
    }
    componentDidMount() {
        // Autologin flow:
        // GET /map/
        // Autologin.jsx:
        //   if param config:autologin is undefined:
        //     if GET /auth/info has no identity:
        //       if GET $autologinUrl is OK:
        //         Redirect to /auth/login?url=/map/?config:autologin=1
        // /auth/acs:
        //   Write username + autologin into JWT cookie
        //   Redirect to /map/?config:autologin=1
        // StandardApp.jsx:
        //   if param config:xxx passed:
        //      load config.json with param xxx
        //      remove config:xxx param from URL
        // qwc2_viewer.qwc2_config:
        //   if param config:autologin passed or autologin in identity:
        //      remove login/logout menu entries
        //
        // Manual login flow:
        // ...
        //         Redirect to /auth/login?url=/map/
        // /auth/acs:
        //   Write username (without autologin) into JWT cookie
        //   Redirect to /map/

        // No action, if redirected from auth service
        if (UrlParams.getParam('config:autologin') !== undefined) {
            UrlParams.updateParams({"config:autologin": undefined});
            return;
        }

        let authServiceUrl = ConfigUtils.getConfigProp('authServiceUrl');

        axios.get(authServiceUrl + '/info').then(res => {
            if(!res.data.username) {
                // Check Intranet URL
                fetch(this.props.autologinUrl, {
                    // we don't need a real fetch
                    // just checking whether Intranet URL resolves
                    mode: 'no-cors',
                })
                .then(res => {
                    // automatic login
                    let urlObj = url.parse(window.location.href);
                    urlObj.query = this.props.startupParams;
                    urlObj.query["config:autologin"] = 1;
                    urlObj.search = undefined;
                    window.location.href = authServiceUrl + "login?url=" + encodeURIComponent(url.format(urlObj));
                }).catch(e => {});
            }
        }).catch(e => {});
    }
    render() {
        return null;
    }
};

export default connect((state) => ({
    startupParams: state.localConfig.startupParams
}), {})(Autologin)
