/**
 * Copyright 2019, Sourcepole AG.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
 */

const React = require('react');
const PropTypes = require('prop-types');
const {connect} = require('react-redux');
const isEmpty = require('lodash.isempty');
const axios = require('axios');
const {zoomToPoint} = require('qwc2/actions/map');
const {LayerRole, addLayerFeatures, addThemeSublayer, removeLayer} = require('qwc2/actions/layers');
const {setCurrentTask} = require('qwc2/actions/task');
const Icon = require('qwc2/components/Icon');
const Message = require("qwc2/components/I18N/Message");
const ConfigUtils = require("qwc2/utils/ConfigUtils");
const LocaleUtils = require('qwc2/utils/LocaleUtils');
const CoordinatesUtils = require('qwc2/utils/CoordinatesUtils');
const MapUtils = require('qwc2/utils/MapUtils');
require('./style/SearchBox.css');

class SearchBox extends React.Component {
    static propTypes = {
        map: PropTypes.object,
        resultLimit: PropTypes.number,
        addThemeSublayer: PropTypes.func,
        addLayerFeatures: PropTypes.func,
        removeLayer: PropTypes.func,
        setCurrentTask: PropTypes.func,
        zoomToPoint: PropTypes.func,
        searchOptions: PropTypes.object
    }
    static defaultProps = {
        resultLimit: 20
    }
    state = {
        searchText: "",
        recentSearches: [],
        searchResults: {},
        resultsVisible: false,
        collapsedSections: {}
    }
    static contextTypes = {
        messages: PropTypes.object
    }
    constructor(props) {
        super(props);
        this.searchBox = null;
        this.searchTimeout = null;
        this.preventBlur = false;
    }
    renderRecentResults = () => {
        let recentSearches = this.state.recentSearches.filter(entry => entry.toLowerCase().includes(this.state.searchText.toLowerCase()));
        if(isEmpty(recentSearches) || (recentSearches.length === 1 && recentSearches[0].toLowerCase() === this.state.searchText.toLowerCase())) {
            return null;
        }
        return (
            <div key="recent">
                <div className="searchbox-results-section-title" onMouseDown={this.killEvent} onClick={ev => this.toggleSection("recent")}>
                    <Icon icon={!!this.state.collapsedSections["recent"] ? "expand" : "collapse"} /><Message msgId="searchbox.recent" />
                </div>
                {!this.state.collapsedSections["recent"] ? (
                    <div className="searchbox-results-section-body">
                        {recentSearches.map((entry ,idx) => (
                            <div key={"r" + idx} onMouseDown={this.killEvent} onClick={ev => this.searchTextChanged(entry)}>
                                {entry}
                            </div>
                        ))}
                    </div>
                ) : null}
            </div>
        );
    }
    renderFilters = (resultCount) => {
        if(isEmpty(this.state.searchResults.result_counts) || this.state.searchResults.result_counts.length < 2) {
            return null;
        }
        const minResultsExanded = ConfigUtils.getConfigProp("minResultsExanded");
        let initialCollapsed = resultCount < minResultsExanded;
        let collapsed = (this.state.collapsedSections["filter"] === undefined) ? initialCollapsed : this.state.collapsedSections["filter"];
        return (
            <div key="filter">
                <div className="searchbox-results-section-title" onMouseDown={this.killEvent} onClick={ev => this.toggleSection("filter")}>
                    <Icon icon={collapsed ? "expand" : "collapse"} /><Message msgId="searchbox.filter" />
                </div>
                {!collapsed ? (
                    <div className="searchbox-results-section-body">
                        {this.state.searchResults.result_counts.map((entry ,idx) => {
                            let value = entry.filterword + ": " + this.state.searchResults.query_text;
                            return (
                                <div key={"f" + idx} onMouseDown={this.killEvent} onClick={ev => this.searchTextChanged(value)}>
                                    {value}
                                </div>
                            );
                        })}
                    </div>
                ) : null}
            </div>
        );
    }
    renderPlaces = (resultCount) => {
        let features = (this.state.searchResults.results || []).filter(result => result.feature);
        if(isEmpty(features)) {
            return null;
        }
        let additionalResults = resultCount - features.length;
        return (
            <div key="places">
                <div className="searchbox-results-section-title" onMouseDown={this.killEvent} onClick={ev => this.toggleSection("places")}>
                    <Icon icon={!!this.state.collapsedSections["places"] ? "expand" : "collapse"} /><Message msgId="searchbox.places" />
                </div>
                {!this.state.collapsedSections["places"] ? (
                    <div className="searchbox-results-section-body">
                        {features.map((entry ,idx) => (
                            <div key={"p" + idx} className="result" onMouseDown={this.killEvent} onClick={ev => this.selectFeatureResult(entry.feature)}>
                                {entry.feature.display}
                            </div>
                        ))}
                        {additionalResults > 0 && (
                            <div className="more-results">
                                {additionalResults} <Message msgId="searchbox.more" />
                            </div>
                        )}
                    </div>
                ) : null}
            </div>
        );
    }
    renderLayers = () => {
        let layers = (this.state.searchResults.results || []).filter(result => result.dataproduct);
        if(isEmpty(layers)) {
            return null;
        }
        return (
            <div key="layers">
                <div className="searchbox-results-section-title" onMouseDown={this.killEvent} onClick={ev => this.toggleSection("layers")}>
                    <Icon icon={!!this.state.collapsedSections["layers"] ? "expand" : "collapse"} /><Message msgId="searchbox.layers" />
                </div>
                {!this.state.collapsedSections["layers"] ? (
                    <div className="searchbox-results-section-body">
                        {layers.map((entry ,idx) => (
                            <div key={"p" + idx} onMouseDown={this.killEvent} onClick={ev => this.selectLayerResult(entry.dataproduct)}>
                                {entry.dataproduct.display}
                            </div>
                        ))}
                    </div>
                ) : null}
            </div>
        );
    }
    renderSearchResults = () => {
        if(!this.state.resultsVisible) {
            return false;
        }
        console.log(this.state.searchResults);
        let resultCount = this.state.searchResults.result_counts ?
            this.state.searchResults.result_counts.reduce((res, entry) => {
                // dataproduct count is always null
                return entry.count ? res + entry.count : res;
            }, 0)
        : 0;
        let children = [
            this.renderRecentResults(),
            this.renderFilters(resultCount),
            this.renderPlaces(resultCount),
            this.renderLayers()
        ].filter(element => element);
        if(isEmpty(children)) {
            return null;
        }
        return (
            <div className="searchbox-results" onMouseDown={this.setPreventBlur}>
                {children}
            </div>
        );
    }
    setPreventBlur = (ev) => {
        this.preventBlur = true;
        setTimeout(() => {this.preventBlur = false; return false;}, 100);
    }
    killEvent = (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
    }
    toggleSection = (key) => {
        let newCollapsedSections = {...this.state.collapsedSections};
        newCollapsedSections[key] = !newCollapsedSections[key];
        this.setState({collapsedSections: newCollapsedSections});
    }
    render() {
        let placeholder = LocaleUtils.getMessageById(this.context.messages, "searchbox.placeholder");
        return (
            <div className="SearchBox">
                <div className="searchbox-field">
                    <Icon icon="search" />
                        <input type="text" ref={el => this.searchBox = el}
                            placeholder={placeholder} value={this.state.searchText}
                            onChange={ev => this.searchTextChanged(ev.target.value)} onKeyDown={this.onKeyDown}
                            onFocus={this.onFocus} onBlur={this.onBlur} />
                </div>
                {this.renderSearchResults()}
            </div>
        );
    }
    searchTextChanged = (text) => {
        this.props.removeLayer('searchselection');
        this.setState({searchText: text});
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(this.startSearch, 250);
    }
    onFocus = () => {
        this.setState({resultsVisible: true});
        if(this.searchBox) {
            this.searchBox.select();
        }
    }
    onBlur = () => {
        if(this.preventBlur && this.searchBox) {
            this.searchBox.focus();
        } else {
            this.setState({resultsVisible: false, collapsedSections: {}});
        }
    }
    onKeyDown = (ev) => {
        if(ev.keyCode === 27 && this.searchBox) {
            this.searchBox.setSelectionRange(this.searchBox.value.length, this.searchBox.value.length);
        }
    }
    startSearch = () => {
        const service = ConfigUtils.getConfigProp("searchServiceUrl").replace(/\/$/g, "") + '/';
        let searchText = this.state.searchText;
        // TODO: default_filter from topics.json + active layers with searchable true
        let searchFilter = 'dataproduct,ch.so.agi.av.gebaeudeadressen.gebaeudeeingaenge,ch.so.agi.gemeindegrenzen.bezirk,ch.so.agi.gemeindegrenzen,ch.so.afu.fliessgewaesser.netz,ch.so.agi.av.grundstuecke.rechtskraeftig,ch.so.arp.richtplan.nationalstrassen_bestehend';
        let params = {
            searchtext: searchText.trim(),
            filter: searchFilter.trim(),
            limit: this.props.resultLimit
        };
        axios.get(service, {params}).then(response => {
            this.setState({searchResults: {...response.data, query_text: searchText}});
        }).catch(e => {
            console.warn("Search failed: " + e);
        })
    }
    updateRecentSearches = (result) => {
        let text = this.state.searchResults.query_text;
        if(!this.state.recentSearches.includes(text)) {
            this.setState({recentSearches: [text, ...this.state.recentSearches.slice(0, 4)]});
        }
        if(this.searchBox) {
            this.searchBox.blur();
        }
    }
    selectFeatureResult = (result) => {
        this.updateRecentSearches(result);
        // URL example: /api/data/v1/ch.so.afu.fliessgewaesser.netz/?filter=[["gewissnr","=",1179]]
        let filter = `[["${result.id_field_name}","=",`;
        if (typeof(result.feature_id) === 'string') {
            filter += `"${result.feature_id}"]]`;
        } else {
            filter += `${result.feature_id}]]`;
        }
        const DATA_URL = ConfigUtils.getConfigProp("editServiceUrl").replace(/\/$/g, "");
        axios.get(DATA_URL + "/" + result.dataproduct_id + "/?filter=" + filter)
        .then(response => this.showFeatureGeometry(result, response.data));
    }
    showFeatureGeometry = (item, data) => {
        // Zoom to bbox
        let maxZoom = MapUtils.computeZoom(this.props.map.scales, this.props.searchOptions.minScale);
        let bbox = CoordinatesUtils.reprojectBbox(data.bbox, data.crs.properties.name, this.props.map.projection);
        let zoom = Math.max(0, MapUtils.getZoomForExtent(bbox, this.props.map.resolutions, this.props.map.size, 0, maxZoom) - 1);
        let x = 0.5 * (bbox[0] + bbox[2]);
        let y = 0.5 * (bbox[1] + bbox[3]);
        this.props.zoomToPoint([x, y], zoom, this.props.map.projection);

        // Add result geometry
        let layer = {
            id: "searchselection",
            role: LayerRole.SELECTION
        };
        this.props.addLayerFeatures(layer, data.features, true);

    }
    selectLayerResult = (result) => {
        this.updateRecentSearches(result);
        const DATAPRODUCT_URL = ConfigUtils.getConfigProp("dataproductServiceUrl").replace(/\/$/g, "");
        let params = {
            filter: result.dataproduct_id
        };
        axios.get(DATAPRODUCT_URL + "/weblayers", {params}).then(response => this.addLayer(result, response.data));
    }
    addLayer = (item, data) => {
        if(!isEmpty(data[item.dataproduct_id])) {
            this.props.addThemeSublayer({sublayers: data[item.dataproduct_id]});
            // Show layer tree to notify user that something has happened
            this.props.setCurrentTask('LayerTree');
        }
    }
};

module.exports = connect(state => ({
    map: state.map
}), {
    addThemeSublayer: addThemeSublayer,
    addLayerFeatures: addLayerFeatures,
    removeLayer: removeLayer,
    setCurrentTask: setCurrentTask,
    zoomToPoint: zoomToPoint
})(SearchBox);
